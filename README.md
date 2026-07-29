# imagemin-rs

An imagemin-compatible image optimization pipeline powered by Rust and napi-rs.

[Documentation](https://imagemin-rs.ntnyq.dev/) · [Getting Started](https://imagemin-rs.ntnyq.dev/guide/getting-started) · [API Reference](https://imagemin-rs.ntnyq.dev/api/) · [Playground](https://imagemin-rs.ntnyq.dev/playground) · [简体中文](https://imagemin-rs.ntnyq.dev/zh/)

[![CI](https://github.com/ntnyq/imagemin-rs/actions/workflows/ci.yml/badge.svg)](https://github.com/ntnyq/imagemin-rs/actions/workflows/ci.yml)
[![NPM VERSION](https://img.shields.io/npm/v/imagemin-rs.svg)](https://www.npmjs.com/package/imagemin-rs)
[![NPM DOWNLOADS](https://img.shields.io/npm/dy/imagemin-rs.svg)](https://www.npmjs.com/package/imagemin-rs)
[![LICENSE](https://img.shields.io/github/license/ntnyq/imagemin-rs.svg)](https://github.com/ntnyq/imagemin-rs/blob/main/LICENSE)

## Features

- Familiar `imagemin()` and `imagemin.buffer()` APIs with typed plugin options.
- Native Rust codecs executed outside the JavaScript event loop with napi-rs.
- SVG, GIF, PNG, JPEG, and WebP optimization and conversion, plus opt-in AVIF.
- Observable `optimize()` results with per-step byte statistics.
- Browser and Web Worker support through the memory-only `@imagemin-rs/wasm` package.
- Reproducible native and sidecar packages for macOS, Linux, and Windows.

See the [documentation](https://imagemin-rs.ntnyq.dev/) for codec behavior,
compatibility boundaries, architecture, and release policy.

## Install

```sh
pnpm add imagemin-rs@next
```

The project is currently published under the npm `next` tag while the release
candidate is validated. See the
[migration guide](https://imagemin-rs.ntnyq.dev/guide/migration-from-imagemin)
when replacing an existing imagemin setup.

AVIF is intentionally opt-in for 1.0. Install the pinned optional peer only
when using `avif()`:

```sh
pnpm add sharp@0.35.3
```

## Quick Start

```ts
import imagemin, { oxipng } from "imagemin-rs";

const output = await imagemin.buffer(input, {
  plugins: [oxipng({ optimizationLevel: 3 })],
});
```

Continue with the [Getting Started guide](https://imagemin-rs.ntnyq.dev/guide/getting-started)
or optimize local images in the [browser playground](https://imagemin-rs.ntnyq.dev/playground).

For a browser or Web Worker, install `@imagemin-rs/wasm@next` and initialize
its WebAssembly runtime before optimizing in-memory `Uint8Array` values:

```ts
import { initWasm, optimize, oxipng } from "@imagemin-rs/wasm";

await initWasm();

const result = await optimize(input, {
  plugins: [oxipng({ optimizationLevel: 3 })],
});
```

See the [Browser WASM API](https://imagemin-rs.ntnyq.dev/api/wasm) for the
supported codec and runtime boundaries.

## License

[MIT](./LICENSE) License © 2026-PRESENT [ntnyq](https://github.com/ntnyq)
