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

## Current focus: the complete public RC

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

The maintainer selected the conservative distribution model for 1.0:

1. Sharp is an exact optional peer, so AVIF is opt-in and the default install
   does not distribute the Sharp/libvips stack;
2. every GPL Gifsicle/pngquant platform package carries matching source and
   build materials, in addition to the release-wide backup assets;
3. AVIF 10/12-bit remains outside the initial stable scope.

The next release candidate must prove that model as one complete public unit:
35 same-version npm packages, eight-platform install and codec smoke, both
without-Sharp and explicit-Sharp paths, provenance/SBOM/notices, and matching
GitHub assets. It also completes the one-time public bootstrap of
`@imagemin-rs/wasm`.

## 1.0 date and gates

The target stable date is **August 17, 2026**. The planned `0.1.0-rc.9` trial
must remain public for 14 consecutive days with no open release-blocking
defect. A blocking fix publishes a new RC and restarts that clock. If the full
RC is late or the trial evidence is incomplete, 1.0 moves; the date does not
override a gate.

See [1.0 Public Trial](./public-trial.md) for participation and blocking
criteria. The canonical internal gate table is the
[1.0 release plan](https://github.com/ntnyq/imagemin-rs/blob/main/internal-docs/1.0-release-plan.md).

## After 1.0

Broader visual and corrupt-input corpora, longer performance histories, more
WASM codecs, AVIF 10/12-bit/HDR, OS-level resource isolation, and a permissive
native AVIF profile are 1.x work. They do not block the locked 1.0 contract.
