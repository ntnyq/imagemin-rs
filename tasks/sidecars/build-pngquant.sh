#!/usr/bin/env bash
# Builds pngquant 3.0.3 and its pinned libimagequant submodule source.
#
# Usage:
#   SIDECAR_TARGET=<darwin-arm64|darwin-x64|linux-*-gnu|linux-*-musl|win32-*-msvc> \
#   tasks/sidecars/build-pngquant.sh <sources-dir> <output-dir>
set -euo pipefail

sources_dir=$(cd "$1" && pwd)
output_dir=$2
target=${SIDECAR_TARGET:?SIDECAR_TARGET is required}
script_dir=$(cd "$(dirname "$0")" && pwd)
work_dir=$(mktemp -d)
trap 'rm -rf "$work_dir"' EXIT
source_root="$work_dir/source"
target_root="$work_dir/target"
mkdir -p "$output_dir" "$source_root/lib"
output_dir=$(cd "$output_dir" && pwd)

pin() {
  node -p \
    "JSON.parse(require('node:fs').readFileSync('$script_dir/pins.json','utf8')).pngquant.sources['$1'].version"
}

pngquant_version=$(pin pngquant)
libimagequant_version=$(pin libimagequant)
tar -xzf "$sources_dir/pngquant-$pngquant_version.tar.gz" \
  -C "$source_root" --strip-components=1
tar -xzf "$sources_dir/libimagequant-$libimagequant_version.tar.gz" \
  -C "$source_root/lib" --strip-components=1
cp "$script_dir/pngquant.Cargo.lock" "$source_root/Cargo.lock"

case "$target" in
  darwin-arm64) rust_target=aarch64-apple-darwin ;;
  darwin-x64) rust_target=x86_64-apple-darwin ;;
  linux-arm64-gnu) rust_target=aarch64-unknown-linux-gnu.2.28 ;;
  linux-arm64-musl) rust_target=aarch64-unknown-linux-musl ;;
  linux-x64-gnu) rust_target=x86_64-unknown-linux-gnu.2.28 ;;
  linux-x64-musl) rust_target=x86_64-unknown-linux-musl ;;
  win32-arm64-msvc) rust_target=aarch64-pc-windows-msvc ;;
  win32-x64-msvc) rust_target=x86_64-pc-windows-msvc ;;
  *)
    echo "Unsupported SIDECAR_TARGET: $target" >&2
    exit 1
    ;;
esac

cargo_command=(cargo build)
if [[ "$target" == linux-* ]]; then
  cargo_command=(cargo zigbuild)
fi
CARGO_TARGET_DIR="$target_root" "${cargo_command[@]}" \
  --locked \
  --release \
  --manifest-path "$source_root/Cargo.toml" \
  --no-default-features \
  --features static,z-static \
  --target "$rust_target"

artifact_target=${rust_target%.2.28}
exe_suffix=""
if [[ "$target" == win32-* ]]; then
  exe_suffix=".exe"
fi
cp "$target_root/$artifact_target/release/pngquant$exe_suffix" \
  "$output_dir/pngquant$exe_suffix"
case "$target" in
  darwin-*) strip -x "$output_dir/pngquant" ;;
  linux-*) strip "$output_dir/pngquant" ;;
esac

licenses_dir="$output_dir/licenses"
mkdir -p "$licenses_dir"
cp "$source_root/COPYRIGHT" "$licenses_dir/pngquant-COPYRIGHT"
cp "$source_root/lib/COPYRIGHT" "$licenses_dir/libimagequant-COPYRIGHT"

node "$script_dir/write-manifest.mjs" \
  --tool pngquant \
  --target "$target" \
  --binary "$output_dir/pngquant$exe_suffix" \
  --output "$output_dir/pngquant.manifest.json"
