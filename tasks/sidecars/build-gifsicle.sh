#!/usr/bin/env bash
# Builds Gifsicle 1.96 from the pinned GPL-2.0 source archive.
#
# Usage:
#   SIDECAR_TARGET=<darwin-arm64|darwin-x64|linux-*-gnu|linux-*-musl|win32-*-msvc> \
#   tasks/sidecars/build-gifsicle.sh <sources-dir> <output-dir>
set -euo pipefail

sources_dir=$(cd "$1" && pwd)
output_dir=$2
target=${SIDECAR_TARGET:?SIDECAR_TARGET is required}
script_dir=$(cd "$(dirname "$0")" && pwd)
work_dir=$(mktemp -d)
trap 'rm -rf "$work_dir"' EXIT
source_root="$work_dir/source"
build_root="$work_dir/build"
mkdir -p "$output_dir" "$source_root" "$build_root"
output_dir=$(cd "$output_dir" && pwd)

gifsicle_version=$(node -p \
  "JSON.parse(require('node:fs').readFileSync('$script_dir/pins.json','utf8')).gifsicle.version")
tar -xzf "$sources_dir/gifsicle-$gifsicle_version.tar.gz" \
  -C "$source_root" --strip-components=1

exe_suffix=""
case "$target" in
  win32-*-msvc)
    exe_suffix=".exe"
    cmake \
      -S "$script_dir/gifsicle-msvc" \
      -B "$build_root" \
      -DCMAKE_BUILD_TYPE=Release \
      -DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreaded \
      -DGIFSICLE_SOURCE_ROOT="$source_root"
    cmake --build "$build_root" --config Release --parallel --target gifsicle
    cp "$build_root/Release/gifsicle.exe" "$output_dir/gifsicle.exe"
    ;;
  darwin-*|linux-*)
    case "$target" in
      darwin-arm64)
        host=aarch64-apple-darwin
        cc="clang -arch arm64"
        cflags="-O2 -mmacosx-version-min=11.0"
        ldflags="-mmacosx-version-min=11.0"
        ;;
      darwin-x64)
        host=x86_64-apple-darwin
        cc="clang -arch x86_64"
        cflags="-O2 -mmacosx-version-min=11.0"
        ldflags="-mmacosx-version-min=11.0"
        ;;
      linux-arm64-gnu)
        host=aarch64-linux-gnu
        cc="$script_dir/zig-cc.sh"
        cflags="-O2"
        ldflags=""
        ;;
      linux-arm64-musl)
        host=aarch64-linux-musl
        cc="$script_dir/zig-cc.sh"
        cflags="-O2"
        ldflags="-static"
        ;;
      linux-x64-gnu)
        host=x86_64-linux-gnu
        cc="$script_dir/zig-cc.sh"
        cflags="-O2"
        ldflags=""
        ;;
      linux-x64-musl)
        host=x86_64-linux-musl
        cc="$script_dir/zig-cc.sh"
        cflags="-O2"
        ldflags="-static"
        ;;
    esac
    (
      cd "$source_root"
      CC="$cc" CFLAGS="$cflags" LDFLAGS="$ldflags" ./configure \
        --host="$host" \
        --disable-gifdiff \
        --disable-gifview \
        --disable-simd \
        --disable-threads
      make --jobs 2 gifsicle
    )
    cp "$source_root/src/gifsicle" "$output_dir/gifsicle"
    case "$target" in
      darwin-*) strip -x "$output_dir/gifsicle" ;;
      linux-*) strip "$output_dir/gifsicle" ;;
    esac
    ;;
  *)
    echo "Unsupported SIDECAR_TARGET: $target" >&2
    exit 1
    ;;
esac

licenses_dir="$output_dir/licenses"
mkdir -p "$licenses_dir"
cp "$source_root/COPYING" "$licenses_dir/gifsicle-COPYING"

node "$script_dir/write-manifest.mjs" \
  --tool gifsicle \
  --target "$target" \
  --binary "$output_dir/gifsicle$exe_suffix" \
  --output "$output_dir/gifsicle.manifest.json"
