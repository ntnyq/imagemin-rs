# Vendored svgm-core 0.3.8

- Upstream: <https://crates.io/crates/svgm-core> 0.3.8
  (<https://github.com/madebyfrmwrk/svgm>), license `MIT OR Apache-2.0`.
- Source: unmodified crates.io package contents except the patch below;
  registry metadata files (`.cargo_vcs_info.json`, `Cargo.toml.orig`,
  `Cargo.lock`, `.cargo-ok`) are removed.
- Wired in through `[patch.crates-io]` in the root workspace and in
  `fuzz/Cargo.toml`.

## Why

`svgm_core::optimize` 0.3.8 never returns on path data whose argument-group
boundary holds a character that is not a command letter, whitespace, comma or
a number start (for example `<path d="M0 0 e"/>`): `parse_path` fails without
consuming the character and the surrounding loops retry forever, allocating an
argument vector on every iteration. Found by the `svg_pipeline` fuzz target
(timeout artifact, 998-byte mutated Illustrator fixture) and reduced to the
one-line case above. A hang in a byte-level optimizer is a denial-of-service
defect under this repository's fuzzing policy.

## Patches

1. `src/passes/convert_path_data.rs::parse_path`: the `else if i == 0` branch
   returns `None` instead of `break`, so path data that can never be consumed
   fails the parse (the pass then leaves that path element unchanged) instead
   of hanging. Inputs that previously parsed successfully are unaffected;
   inputs with trailing garbage such as `M0 0 -` are now left unmodified
   rather than rewritten without the garbage, which preserves renderer
   error-recovery semantics.
2. `src/passes/minify_styles.rs` (`minify_css`, `shorten_colors_in_css`) and
   `src/passes/convert_transform.rs` (`normalize_european_decimals`): output is
   assembled as bytes instead of `push(byte as char)`. The cast re-encoded
   every non-ASCII byte as a Latin-1 code point, which corrupted multi-byte
   UTF-8 text and doubled it twice per fixed-point iteration — about a
   million-fold growth per optimize call, found as an svg_pipeline timeout.
   ASCII-only inputs produce byte-identical output.

## Upstream reports

- parse_path hang: <https://github.com/madebyfrmwrk/svgm/issues/22>
- minifyStyles/convertTransform byte-as-char: <https://github.com/madebyfrmwrk/svgm/issues/23>
- truncated input serializes to empty (guarded in our adapter, not patched
  here): <https://github.com/madebyfrmwrk/svgm/issues/24>

## Removal condition

Drop this directory and both `[patch.crates-io]` entries once an upstream
release fixes issues 22 and 23 and the pinned `svgm-core` version is bumped
accordingly (re-run the SVG conformance and benchmark gates when that
happens).
