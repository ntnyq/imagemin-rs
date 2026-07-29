#!/usr/bin/env bash
# Builds a statically linked cwebp (PNG/JPEG/TIFF/WebP input support) from the
# pinned sources in pins.json. Every dependency is compiled here; nothing is
# taken from the host beyond the C toolchain itself.
#
# Usage:
#   SIDECAR_TARGET=<darwin-arm64|darwin-x64|linux-*-gnu|linux-*-musl|win32-*-msvc> \
#   tasks/sidecars/build-cwebp.sh <sources-dir> <output-dir>
set -euo pipefail

sources_dir=$(cd "$1" && pwd)
output_dir=$2
target=${SIDECAR_TARGET:?SIDECAR_TARGET is required}
script_dir=$(cd "$(dirname "$0")" && pwd)
work_dir=$(mktemp -d)
trap 'rm -rf "$work_dir"' EXIT
prefix="$work_dir/prefix"
mkdir -p "$output_dir" "$prefix"
output_dir=$(cd "$output_dir" && pwd)

pin() {
  node -p "JSON.parse(require('node:fs').readFileSync('$script_dir/pins.json','utf8')).cwebp.sources['$1'].version"
}

zlib_version=$(pin zlib)
libpng_version=$(pin libpng)
libjpeg_version=$(pin libjpeg-turbo)
libtiff_version=$(pin libtiff)
libwebp_version=$(pin libwebp)

common_flags=(
  -DCMAKE_BUILD_TYPE=Release
  -DCMAKE_INSTALL_PREFIX="$prefix"
  -DCMAKE_PREFIX_PATH="$prefix"
  -DCMAKE_POLICY_VERSION_MINIMUM=3.5
  -DBUILD_SHARED_LIBS=OFF
)
if [[ -n ${SIDECAR_ZIG_TARGET:-} ]]; then
  common_flags+=(
    -DCMAKE_C_COMPILER="$script_dir/zig-cc.sh"
    -DCMAKE_CXX_COMPILER="$script_dir/zig-cxx.sh"
  )
fi
exe_suffix=""
case "$target" in
  darwin-arm64)
    common_flags+=(-DCMAKE_OSX_ARCHITECTURES=arm64 -DCMAKE_OSX_DEPLOYMENT_TARGET=11.0)
    ;;
  darwin-x64)
    common_flags+=(-DCMAKE_OSX_ARCHITECTURES=x86_64 -DCMAKE_OSX_DEPLOYMENT_TARGET=11.0)
    ;;
  linux-*-musl)
    # Fully static executables on musl so the binary runs on any Linux.
    common_flags+=(-DCMAKE_EXE_LINKER_FLAGS=-static)
    ;;
  linux-*-gnu)
    ;;
  win32-*-msvc)
    # Static CRT so the executable does not require a vcruntime redist.
    common_flags+=(-DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreaded)
    exe_suffix=".exe"
    ;;
  *)
    echo "Unsupported SIDECAR_TARGET: $target" >&2
    exit 1
    ;;
esac
if [[ "$target" != win32-* ]] && command -v ninja >/dev/null 2>&1; then
  common_flags+=(-G Ninja)
fi

build() {
  local name=$1 archive=$2 source_subdir=$3
  shift 3
  local source_root="$work_dir/src-$name"
  mkdir -p "$source_root"
  tar -xzf "$sources_dir/$archive" -C "$source_root" --strip-components=1
  cmake -S "$source_root/$source_subdir" -B "$work_dir/build-$name" "${common_flags[@]}" "$@"
  cmake --build "$work_dir/build-$name" --config Release --parallel
  cmake --install "$work_dir/build-$name" --config Release
}

build zlib "zlib-$zlib_version.tar.gz" "." \
  -DZLIB_BUILD_SHARED=OFF -DZLIB_BUILD_TESTING=OFF -DZLIB_BUILD_MINIZIP=OFF
build libpng "libpng-$libpng_version.tar.gz" "." \
  -DPNG_FRAMEWORK=OFF -DPNG_SHARED=OFF -DPNG_STATIC=ON -DPNG_TESTS=OFF \
  -DPNG_TOOLS=OFF -DZLIB_ROOT="$prefix"
build libjpeg-turbo "libjpeg-turbo-$libjpeg_version.tar.gz" "." \
  -DENABLE_SHARED=OFF -DENABLE_STATIC=ON -DWITH_TURBOJPEG=OFF
build libtiff "libtiff-$libtiff_version.tar.gz" "." \
  -Dtiff-tools=OFF -Dtiff-tests=OFF -Dtiff-contrib=OFF -Dtiff-docs=OFF \
  -Dlzma=OFF -Dzstd=OFF -Dwebp=OFF -Djbig=OFF -Dlerc=OFF -Dlibdeflate=OFF \
  -Dcxx=OFF -Dmdi=OFF -Dopengl=OFF -Dpixarlog=OFF -DZLIB_ROOT="$prefix"
build libwebp "libwebp-$libwebp_version.tar.gz" "." \
  -DWEBP_BUILD_CWEBP=ON -DWEBP_BUILD_DWEBP=OFF -DWEBP_BUILD_GIF2WEBP=OFF \
  -DWEBP_BUILD_IMG2WEBP=OFF -DWEBP_BUILD_VWEBP=OFF -DWEBP_BUILD_WEBPINFO=OFF \
  -DWEBP_BUILD_WEBPMUX=OFF -DWEBP_BUILD_ANIM_UTILS=OFF -DWEBP_BUILD_EXTRAS=OFF \
  -DWEBP_LINK_STATIC=OFF -DCMAKE_DISABLE_FIND_PACKAGE_GIF=ON -DZLIB_ROOT="$prefix"

binary="$prefix/bin/cwebp$exe_suffix"
if [[ ! -f "$binary" ]]; then
  binary="$work_dir/build-libwebp/cwebp$exe_suffix"
fi
cp "$binary" "$output_dir/cwebp$exe_suffix"
case "$target" in
  darwin-*) strip -x "$output_dir/cwebp" ;;
  linux-*) strip "$output_dir/cwebp" ;;
esac

licenses_dir="$output_dir/licenses"
mkdir -p "$licenses_dir"
cp "$work_dir/src-libwebp/COPYING" "$licenses_dir/libwebp-COPYING.txt"
cp "$work_dir/src-libwebp/PATENTS" "$licenses_dir/libwebp-PATENTS.txt"
cp "$work_dir/src-libjpeg-turbo/LICENSE.md" "$licenses_dir/libjpeg-turbo-LICENSE.md"
cp "$work_dir/src-libjpeg-turbo/README.ijg" "$licenses_dir/libjpeg-turbo-README.ijg"
cp "$work_dir/src-libpng/LICENSE" "$licenses_dir/libpng-LICENSE.txt"
cp "$work_dir/src-libtiff/LICENSE.md" "$licenses_dir/libtiff-LICENSE.md"
cp "$work_dir/src-zlib/LICENSE" "$licenses_dir/zlib-LICENSE.txt"

node "$script_dir/write-manifest.mjs" \
  --tool cwebp \
  --target "$target" \
  --binary "$output_dir/cwebp$exe_suffix" \
  --output "$output_dir/cwebp.manifest.json"
