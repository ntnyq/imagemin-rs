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
- SVG, GIF, PNG, JPEG, WebP, and AVIF optimization and conversion.
- Observable `optimize()` results with per-step byte statistics.
- Reproducible native and sidecar packages for macOS, Linux, and Windows.

See the [documentation](https://imagemin-rs.ntnyq.dev/) for codec behavior,
compatibility boundaries, architecture, and release policy.

## Install

```sh
pnpm add imagemin-rs
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

## License

[MIT](./LICENSE) License © 2026-PRESENT [ntnyq](https://github.com/ntnyq)
