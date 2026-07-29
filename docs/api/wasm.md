# Browser WASM API

`@imagemin-rs/wasm` runs the shared imagemin-rs Rust pipeline in browsers and
Web Workers. It is asynchronous and memory-only: inputs and outputs are
`Uint8Array` values, with no Node.js native binding or executable sidecar.

## Install and initialize

```sh
pnpm add @imagemin-rs/wasm@next
```

Initialize once before calling a plugin or pipeline API. Normal browser ESM
imports and bundlers load the adjacent `.wasm` asset automatically. An
explicit URL, `WebAssembly.Module`, response, or byte buffer can be supplied
when an application has its own asset policy.

```ts
import { initWasm, isWasmInitialized } from "@imagemin-rs/wasm";

await initWasm();
console.log(isWasmInitialized()); // true
```

Repeated calls share the same initialization promise, and a failed attempt can
be retried.

## Optimize in memory

```ts
import { initWasm, optimize, oxipng } from "@imagemin-rs/wasm";

await initWasm();

const input = new Uint8Array(await (await fetch("/image.png")).arrayBuffer());
const result = await optimize(input, {
  plugins: [oxipng({ optimizationLevel: 3, strip: "safe" })],
});

console.log(result.data, result.inputBytes, result.outputBytes, result.steps);
```

The supported built-in factories are:

| Factory         | Input | Behavior                                                 |
| --------------- | ----- | -------------------------------------------------------- |
| `oxipng()`      | PNG   | Lossless Oxipng profile; never keeps a larger result.    |
| `optipng()`     | PNG   | Native OptiPNG-compatible option mapping.                |
| `giflossless()` | GIF   | Frame-preserving lossless animation optimization.        |
| `svgm()`        | SVG   | Bounded native SVG optimization with safe/default modes. |

Adjacent built-in plugins are sent through one Rust pipeline call. Custom
browser plugins remain ordinary functions and execute strictly in array order:

```ts
const copy = async (input: Uint8Array) => new Uint8Array(input);

const result = await optimize(input, {
  plugins: [oxipng(), copy],
});
```

## Errors and cancellation

Rust validation and codec failures reject with `ImageminError`. Its `code` is
a stable `ERR_IMAGEMIN_*` value and `plugin` identifies the active built-in
profile when available. Initialization and asset-loading failures use
`ERR_IMAGEMIN_WASM_LOAD`.

`AbortSignal` is checked between plugins. WebAssembly computation is
synchronous once it starts, so a signal cannot preempt an active codec call.
Run CPU-heavy work in a Web Worker and terminate that Worker when hard
cancellation is required. The documentation Playground uses this model.

## Runtime boundary

The package does not expose file paths, glob expansion, a destination
directory, CLI commands, a disk cache, N-API, or executable sidecars.
Consequently `gifsicle`, `pngquant`, `mozjpeg`, `jpegtran`, `webp`, and `avif`
are Node-only. `svgo` also stays at the JavaScript compatibility seam; use
`svgm()` for the shared Rust/WASM profile.

Packed-package acceptance runs in Chromium, Firefox, and WebKit. Applications
must serve `.wasm` files with `application/wasm` for streaming compilation;
the generated loader falls back to buffered instantiation when necessary.
