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

## Current focus: the 1.0 public trial

`0.1.0-rc.9` completed the release unit on July 30, 2026:

1. all 35 npm packages are public under `next` with integrity, signatures, and
   provenance;
2. the immutable tag and GitHub Release contain SBOM, OpenVEX, notices, GPL
   source, build materials, and recovery assets;
3. all eight native targets passed fresh installation and every-codec smoke;
4. default-without-Sharp, explicit `sharp@0.35.3`, and browser WASM paths
   passed registry fresh-install verification;
5. `@imagemin-rs/wasm` completed bootstrap and trusted-publisher setup.

The trial clock started at **2026-07-30 06:29 +08:00**. Fourteen consecutive
days end at **2026-08-13 06:29 +08:00**. The remaining 1.0 evidence is three
independent consumer reports across at least two OS families, including
default-without-Sharp, AVIF with explicit Sharp, and browser or Worker WASM.

The target stable date remains **August 17, 2026**. A P0/P1 fix requires a new
RC and restarts the clock. Missing consumer evidence extends the trial without
forcing a new RC. Follow the live ledger in
[1.0 Public Trial](./public-trial.md).

## Locked 1.0 scope

The maintainer selected the conservative distribution model:

1. Sharp is an exact optional peer, so AVIF is opt-in and the default install
   does not distribute the Sharp/libvips stack;
2. every GPL Gifsicle/pngquant platform package carries matching source and
   build materials, in addition to release-wide backup assets;
3. the browser package remains memory-only with GIF, PNG, and SVG profiles;
4. AVIF 10/12-bit, new codecs, and OS-level isolation stay outside 1.0.

No new feature is added before stable unless it fixes a release-blocking
defect. The canonical internal gate table is the
[1.0 release plan](https://github.com/ntnyq/imagemin-rs/blob/main/internal-docs/1.0-release-plan.md).

## Planned 1.x tracks

| Track                      | First deliverable                                                       |
| -------------------------- | ----------------------------------------------------------------------- |
| Browser runtime ergonomics | First-class Worker client, batch scheduling, and progress/cancel events |
| WASM capability            | Evaluate more permissively licensed codecs and streaming-friendly APIs  |
| AVIF and color             | Permissive native profile plus 10/12-bit, HDR, and color contracts      |
| Runtime isolation          | Stronger hard cancellation and OS-level CPU/RSS/process controls        |
| Quality evidence           | Larger visual/corrupt-input corpora and longer performance histories    |
| Reproducibility            | Compare rebuilt sidecar binaries where upstream toolchains permit it    |

Each track requires a separate public contract and evidence plan. It does not
retroactively block the locked 1.0 release.
