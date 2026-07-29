# imagemin-rs

An imagemin-compatible image optimization pipeline powered by Rust and napi-rs.

The repository has completed the Phase 6 codec slice and is not published yet. The implemented vertical slices include:

- an imagemin-compatible JavaScript plugin pipeline;
- a small `optimize()` interface with per-step statistics;
- a CPU-safe napi-rs `AsyncTask` binding;
- a pure Rust pipeline and a lossless Oxipng adapter;
- an exact SVGO 4 compatibility plugin plus a constrained native SVGM worker-pool plugin;
- a Gifsicle compatibility sidecar plus a permissive native lossless GIF profile;
- an `imagemin-optipng@8`-shaped native profile with explicit Oxipng differences;
- an `imagemin-pngquant@10` compatibility sidecar with alpha-aware visual conformance;
- `imagemin-mozjpeg@10` and `imagemin-jpegtran@8` compatibility sidecars with
  progressive, advanced-option, metadata, and independent-decoder conformance;
- an `imagemin-webp@8` compatibility sidecar with all documented options, format-changing
  file destinations, alpha/metadata conformance, and animation-safe pass-through;
- an `imagemin-avif@0.1` compatibility adapter using an isolated, pinned Sharp runtime with
  alpha/chroma conformance, bounded concurrency, and animation-safe pass-through;
- native SVG byte, node, nesting, DTD/entity, and UTF-8 safety limits;
- Rust, binding, TypeScript, and package-level tests;
- a VitePress documentation site and cargo-deny supply-chain gate.

```ts
import imagemin, {
  avif,
  giflossless,
  gifsicle,
  jpegtran,
  mozjpeg,
  optimize,
  optipng,
  oxipng,
  pngquant,
  svgm,
  svgo,
  webp,
} from "imagemin-rs";

const data = await imagemin.buffer(input, {
  plugins: [oxipng({ optimizationLevel: 3 })],
});

const result = await optimize(input, {
  plugins: [oxipng()],
});

const compatibleSvg = await imagemin.buffer(svgInput, {
  plugins: [svgo({ multipass: true })],
});

const nativeSvg = await imagemin.buffer(svgInput, {
  plugins: [svgm({ preset: "safe" })],
});

const compatibleGif = await imagemin.buffer(gifInput, {
  plugins: [gifsicle({ optimizationLevel: 3 })],
});

const nativeGif = await imagemin.buffer(gifInput, {
  plugins: [giflossless()],
});

const compatiblePng = await imagemin.buffer(pngInput, {
  plugins: [optipng({ optimizationLevel: 3 })],
});

const lossyPng = await imagemin.buffer(pngInput, {
  plugins: [pngquant({ quality: [0.6, 0.8] })],
});

const lossyJpeg = await imagemin.buffer(jpegInput, {
  plugins: [mozjpeg({ quality: 80, progressive: true })],
});

const coefficientLosslessJpeg = await imagemin.buffer(jpegInput, {
  plugins: [jpegtran({ progressive: true })],
});

const convertedWebp = await imagemin.buffer(pngInput, {
  plugins: [webp({ quality: 80, method: 6 })],
});

const convertedAvif = await imagemin.buffer(pngInput, {
  plugins: [avif({ quality: 80, effort: 6 })],
});

console.log(result.inputBytes, result.outputBytes);
```

## Development

```sh
pnpm install
pnpm run build:native
pnpm run check
```

## Project notes

- [Architecture](./internal-docs/adr/0001-architecture.md)
- [SVG engine decision](./internal-docs/adr/0002-svg-engine.md)
- [GIF/OptiPNG engine decision](./internal-docs/adr/0003-gif-optipng-engines.md)
- [pngquant engine decision](./internal-docs/adr/0004-pngquant-engine.md)
- [JPEG engine decision](./internal-docs/adr/0005-jpeg-engines.md)
- [WebP engine decision](./internal-docs/adr/0006-webp-engine.md)
- [AVIF engine decision](./internal-docs/adr/0007-avif-engine.md)
- [Sidecar build & distribution decision](./internal-docs/adr/0009-sidecar-distribution.md)
- [Phased implementation plan](./internal-docs/implementation-plan.md)
- [Release runbook](./internal-docs/releasing.md)
- [Upstream research](./docs/research/upstream-landscape.md)
- [SVG codec research](./docs/research/svg-codec-selection.md)
- [GIF/OptiPNG codec research](./docs/research/gif-optipng-codec-selection.md)
- [pngquant codec research](./docs/research/pngquant-codec-selection.md)
- [JPEG codec research](./docs/research/jpeg-codec-selection.md)
- [WebP codec research](./docs/research/webp-codec-selection.md)
- [AVIF codec research](./docs/research/avif-codec-selection.md)

Released under the MIT License.
