# GIF and Lossless PNG

imagemin-rs provides two GIF paths and two lossless PNG paths. Compatibility
entry points retain familiar imagemin plugin names; explicit native entry
points expose permissively licensed profiles that run in the napi-rs worker
pool.

## `gifsicle()`: compatibility sidecar

```ts
import imagemin, { gifsicle } from "imagemin-rs";

const output = await imagemin.buffer(input, {
  plugins: [gifsicle({ optimizationLevel: 3, colors: 128 })],
});
```

Supported options are `interlaced`, `optimizationLevel: 1 | 2 | 3`, and
`colors: 2..256`. Omitting `optimizationLevel` adds no implicit level, matching
the actual behavior of `imagemin-gifsicle@7.0.0`.

The adapter executes a separately built Gifsicle 1.96 sidecar rather than
linking GPL code into the MIT native addon. Platform packages contain SHA-256
provenance and the GPL-2.0-only license. Application extensions are stripped by
default, while loop and frame timing semantics are preserved. `colors` is a
lossy quantization option.

## `giflossless()`: conservative native optimization

```ts
import { giflossless } from "imagemin-rs";

const output = await giflossless({ strip: false })(input);
```

This profile uses a permissively licensed Rust parser and compositor. It
re-encodes frames into a global palette and delta rectangles only when
composited pixels can be proven equivalent. Animations that cannot be
represented safely are returned unchanged. Metadata is retained by default;
`strip: true` removes comment and application metadata but preserves looping.

Use `gifsicle()` when you need color quantization or Gifsicle optimization
levels.

## `optipng()`: OptiPNG-shaped native profile

```ts
import { optipng } from "imagemin-rs";

const output = await optipng({
  optimizationLevel: 3,
  bitDepthReduction: true,
  colorTypeReduction: true,
  paletteReduction: true,
  interlaced: false,
  errorRecovery: true,
})(input);
```

Defaults follow `imagemin-optipng@8.0.0`, including stripping ancillary
metadata. The implementation uses `oxipng@10.1.1`, not OptiPNG 0.7.7, so it
does not promise identical trial counts, repairs, or output bytes. Corpus tests
verify decoded pixels across PNG color types and bit depths.

APNG is passed through. OptiPNG predates APNG, and stripping all metadata would
remove animation chunks.

## `oxipng()`: native Oxipng profile

`oxipng()` exposes Oxipng presets `0..6`, `strip: "none" | "safe" | "all"`,
`optimizeAlpha`, and `interlace`. It accepts only a smaller or equal result.
The two PNG factories are intentionally distinct: one maps the imagemin option
shape, while the other expresses Oxipng policy directly.
