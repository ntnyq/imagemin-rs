#!/usr/bin/env bash
set -euo pipefail

exec zig c++ -target "${SIDECAR_ZIG_TARGET:?SIDECAR_ZIG_TARGET is required}" "$@"
