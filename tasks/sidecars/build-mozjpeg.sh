#!/usr/bin/env bash
# Builds statically linked MozJPEG cjpeg and jpegtran executables from the
# pinned source in pins.json.
#
# Usage:
#   SIDECAR_TARGET=<darwin-arm64|darwin-x64|linux-*-gnu|linux-*-musl|win32-*-msvc> \
#   tasks/sidecars/build-mozjpeg.sh <sources-dir> <output-dir>
set -euo pipefail

sources_dir=$(cd "$1" && pwd)
output_dir=$2
target=${SIDECAR_TARGET:?SIDECAR_TARGET is required}
script_dir=$(cd "$(dirname "$0")" && pwd)
work_dir=$(mktemp -d)
trap 'rm -rf "$work_dir"' EXIT
mkdir -p "$output_dir"
output_dir=$(cd "$output_dir" && pwd)

mozjpeg_version=$(node "$script_dir/read-pin.mjs" --tool mozjpeg)
source_root="$work_dir/source"
build_root="$work_dir/build"
mkdir -p "$source_root"
tar -xzf "$sources_dir/mozjpeg-$mozjpeg_version.tar.gz" \
  -C "$source_root" --strip-components=1

cmake_flags=(
  -DCMAKE_BUILD_TYPE=Release
  -DCMAKE_POLICY_VERSION_MINIMUM=3.5
  -DENABLE_SHARED=OFF
  -DENABLE_STATIC=ON
  -DPNG_SUPPORTED=OFF
  -DWITH_12BIT=OFF
  -DWITH_ARITH_DEC=OFF
  -DWITH_ARITH_ENC=OFF
  -DWITH_FUZZ=OFF
  -DWITH_JAVA=OFF
  -DWITH_TURBOJPEG=OFF
)
if [[ -n ${SIDECAR_ZIG_TARGET:-} ]]; then
  cmake_flags+=(
    -DCMAKE_C_COMPILER="$script_dir/zig-cc.sh"
    -DCMAKE_CXX_COMPILER="$script_dir/zig-cxx.sh"
  )
fi
exe_suffix=""
case "$target" in
  darwin-arm64)
    cmake_flags+=(-DCMAKE_OSX_ARCHITECTURES=arm64 -DCMAKE_OSX_DEPLOYMENT_TARGET=11.0)
    ;;
  darwin-x64)
    cmake_flags+=(-DCMAKE_OSX_ARCHITECTURES=x86_64 -DCMAKE_OSX_DEPLOYMENT_TARGET=11.0)
    ;;
  linux-*-musl)
    cmake_flags+=(-DCMAKE_EXE_LINKER_FLAGS=-static)
    ;;
  linux-*-gnu)
    ;;
  win32-*-msvc)
    cmake_flags+=(-DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreaded)
    exe_suffix=".exe"
    ;;
  *)
    echo "Unsupported SIDECAR_TARGET: $target" >&2
    exit 1
    ;;
esac
if [[ "$target" != win32-* ]] && command -v ninja >/dev/null 2>&1; then
  cmake_flags+=(-G Ninja)
fi

cmake -S "$source_root" -B "$build_root" "${cmake_flags[@]}"
for cache_entry in \
  "WITH_12BIT:BOOL=OFF" \
  "WITH_ARITH_DEC:BOOL=OFF" \
  "WITH_ARITH_ENC:BOOL=OFF"; do
  if ! grep -qx "$cache_entry" "$build_root/CMakeCache.txt"; then
    echo "MozJPEG configuration assertion failed: $cache_entry" >&2
    exit 1
  fi
done
cmake --build "$build_root" --config Release --parallel \
  --target cjpeg-static jpegtran-static

configuration_dir=""
if [[ "$target" == win32-* ]]; then
  configuration_dir="Release/"
fi
for binary_name in cjpeg jpegtran; do
  cp "$build_root/${configuration_dir}${binary_name}-static$exe_suffix" \
    "$output_dir/$binary_name$exe_suffix"
  case "$target" in
    darwin-*) strip -x "$output_dir/$binary_name" ;;
    linux-*) strip "$output_dir/$binary_name" ;;
  esac
  node "$script_dir/write-manifest.mjs" \
    --tool mozjpeg \
    --target "$target" \
    --binary "$output_dir/$binary_name$exe_suffix" \
    --output "$output_dir/$binary_name.manifest.json"
done

licenses_dir="$output_dir/licenses"
mkdir -p "$licenses_dir"
cp "$source_root/LICENSE.md" "$licenses_dir/mozjpeg-LICENSE.md"
cp "$source_root/README.ijg" "$licenses_dir/mozjpeg-README.ijg"
