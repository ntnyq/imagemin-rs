# Roadmap

Codec implementation order came from a single rolling-year npm downloads
window rather than subjective priority.

| Phase | Compatibility target               | Status   |
| ----- | ---------------------------------- | -------- |
| 0     | Core pipeline and Oxipng prototype | Complete |
| 1     | `imagemin-svgo`                    | Complete |
| 2     | `imagemin-gifsicle` and OptiPNG    | Complete |
| 3     | `imagemin-pngquant`                | Complete |
| 4     | `imagemin-mozjpeg` and jpegtran    | Complete |
| 5     | `imagemin-webp`                    | Complete |
| 6     | `imagemin-avif`                    | Complete |

Every codec phase includes a codec ADR, real corpus, Rust adapter, N-API tests,
JavaScript compatibility contract, platform smoke tests, benchmarks, and a
public compatibility table.

## Current focus: release hardening

Completed release work includes:

1. reproducible source verification and multi-platform builds for cwebp,
   MozJPEG, pngquant, and Gifsicle sidecars;
2. all native and sidecar platform packages in verify, pack, smoke, publish,
   and provenance flows;
3. deterministic CycloneDX inventories for release bundles, Rust packages,
   production npm dependencies, and embedded native libraries;
4. release-blocking RustSec, Cargo policy, and high-severity production npm
   audits;
5. tagged release candidates validated through the full cross-platform
   packaging and smoke matrix.

Next milestones are stable-release readiness, more corpus coverage and
performance baselines, and a browser-native codec runtime that can replace the
Playground's current Canvas-based preview engine.

See [ADR 0009](https://github.com/ntnyq/imagemin-rs/blob/main/internal-docs/adr/0009-sidecar-distribution.md)
and the [implementation plan](https://github.com/ntnyq/imagemin-rs/blob/main/internal-docs/implementation-plan.md)
for detailed gates.
