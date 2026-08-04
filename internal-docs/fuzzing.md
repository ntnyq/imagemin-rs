# Fuzzing runbook

The native PNG, GIF and SVG pipelines are covered by `cargo-fuzz`/libFuzzer. The fuzz crate is an
independent workspace so nightly-only sanitizer flags and `libfuzzer-sys` never enter the release
workspace or its lockfile.

## Targets

| Target         | Surface                                                | Seed fixtures  |
| -------------- | ------------------------------------------------------ | -------------- |
| `png_pipeline` | format detection, oxipng and optipng-compatible paths  | `fixtures/png` |
| `gif_pipeline` | GIF decode, disposal, palette planning and re-encoding | `fixtures/gif` |
| `svg_pipeline` | UTF-8/XML validation, resource limits and SVGM passes  | `fixtures/svg` |

Each successful optimization checks pipeline accounting, format preservation and replay safety:
the optimizer must accept its own output. Hex-encoded PNG/GIF fixtures are decoded inside the
harness, including mostly-hex mutations, so the existing reviewable fixtures seed deep decoder
paths without duplicate binary blobs.

## Local run

Install the pinned tool once, then run a bounded target from the repository root:

```sh
cargo install cargo-fuzz --version 0.13.2 --locked
cargo +nightly fuzz run png_pipeline fuzz/corpus/png_pipeline fixtures/png -- \
  -max_total_time=60 -max_len=1048576 -rss_limit_mb=2048 -timeout=10
```

Replace the target and fixture directory for GIF or SVG. Crash inputs are written under
`fuzz/artifacts/<target>/`; replay and minimize them before promoting a regression fixture:

```sh
cargo +nightly fuzz run png_pipeline fuzz/artifacts/png_pipeline/<case>
cargo +nightly fuzz tmin png_pipeline fuzz/artifacts/png_pipeline/<case>
```

Do not discard a crash merely because it is malformed. Panics, sanitizer findings, runaway
resource use and rejection of the optimizer's own output are product defects.

## Findings log

Every crash or timeout artifact must end up here with its resolution before the artifact is
deleted; the regression lives in normal tests, not in binary blobs.

| Date       | Target         | Input essence                                                          | Defect and resolution                                                                                                                                                                                                                                                                                                                                                            |
| ---------- | -------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-17 | `gif_pipeline` | GIF with a 0×0 logical screen                                          | Panic while compositing frames onto an empty canvas. Fixed by `validate_canvas` in `imagemin-codec-gif`; regression test `rejects_zero_sized_logical_screens_without_panicking`.                                                                                                                                                                                                 |
| 2026-07-26 | `svg_pipeline` | `<path d="M0 0 e"/>` (unconsumable char at an argument-group boundary) | `svgm-core` 0.3.8 `parse_path` never terminates. Fixed by the vendored patch in `vendor/svgm-core` (see ADR 0002); regression test `terminates_on_unconsumable_path_data_characters`.                                                                                                                                                                                            |
| 2026-07-27 | `svg_pipeline` | non-ASCII text inside `<style>`                                        | `svgm-core` 0.3.8 `minifyStyles` re-encodes bytes via `byte as char`, corrupting UTF-8 and quadrupling the text per fixed-point iteration (~×10^6 per call; replay then times out). Fixed in the vendored patch together with the same cast in `convertTransform`; regression test `preserves_non_ascii_style_text_without_amplification`.                                       |
| 2026-07-27 | `svg_pipeline` | 4-byte `<svg` (truncated document)                                     | SVGM serializes a rootless parse to an empty string, silently turning an SVG into a zero-byte non-SVG buffer. Input validation now rejects incomplete XML with `ERR_IMAGEMIN_INVALID_INPUT`; output format validation remains the fallback for non-SVG roots. Regression test `rejects_truncated_or_non_svg_documents`.                                                          |
| 2026-07-27 | `svg_pipeline` | `<svg >t&#0` (truncated character reference and document)              | The tokenizer accepted an incomplete numeric reference and unclosed root; SVGM emitted a NUL-containing document that failed on replay. Input validation now checks XML references, balanced element names, nesting and a single root before optimization. Regression tests `rejects_the_minimized_optimizer_replay_finding` and `rejects_unbalanced_or_multiple_root_elements`. |
| 2026-08-03 | `gif_pipeline` | 92-byte GIF declaring a 2,080×18,696 logical screen                    | Repeated full-canvas composition took 13 seconds and exceeded the per-input timeout while remaining below the original 512 MiB estimate. The native canvas estimate limit is now 128 MiB, so the input is rejected before allocation and composition; regression test `rejects_fuzz_canvas_timeout_before_compositing`. |

## CI policy

`.github/workflows/fuzz.yml` runs every target for 30 seconds on relevant pushes and pull requests,
and for 10 minutes every Monday. Inputs are capped at 1 MiB, each execution at 10 seconds and RSS at
2 GiB. Failures upload the target's artifacts for deterministic replay. The workflow follows the
Rust Fuzz Book's recommended CI smoke pattern and pins `cargo-fuzz`; the nightly compiler remains a
rolling test dependency and does not affect the Rust 1.88 release MSRV.
