# Browser and Web Worker Guide

Use `@imagemin-rs/wasm` when image bytes already live in a browser and the
application does not need Node.js paths, globbing, native bindings, or
executable sidecars. The package is asynchronous and memory-only: it accepts
and returns `Uint8Array` values.

This guide covers a direct call for small jobs and a production-oriented
module Worker for responsive applications. The complete runnable project is
in [`examples/browser-wasm`](https://github.com/ntnyq/imagemin-rs/tree/main/examples/browser-wasm).

## Choose the runtime

| Requirement                            | Browser WASM               | Node package                 |
| -------------------------------------- | -------------------------- | ---------------------------- |
| In-memory GIF, PNG, or SVG             | Yes                        | Yes                          |
| File paths, globs, destination folders | No                         | Yes                          |
| `giflossless`, `oxipng`, `optipng`     | Yes                        | Yes                          |
| `svgm`                                 | Yes                        | Yes                          |
| Gifsicle, pngquant, JPEG, WebP, AVIF   | No                         | Yes                          |
| Hard cancellation                      | Terminate a Web Worker     | Process/worker policy varies |
| Browser-local processing               | Yes; no upload is required | No; runs in the Node process |

## Install

The public trial uses the npm `next` tag:

```sh
pnpm add @imagemin-rs/wasm@next
```

After 1.0, omit `@next` to install the stable `latest` release.

## Direct use for a small job

Calling the API on the main thread is convenient for a small image or a
controlled one-off task. Initialize once, pass bytes to `optimize()`, and turn
the result back into a `Blob` if the browser should display or download it.

<<< ../../examples/browser-wasm/src/direct.ts

`AbortSignal` rejects queued work and is checked between plugins. A codec call
that is already executing inside WebAssembly is synchronous and cannot be
preempted by the signal. Use a Worker when the page must remain responsive or
when cancellation must stop active computation.

## Run the complete Worker example

From a repository checkout:

```sh
pnpm install
pnpm example:browser:dev
```

Open the local URL printed by Vite, select a PNG, animated GIF, or SVG, then
optimize and download it. To verify the production bundle:

```sh
pnpm example:browser:build
```

The build checks TypeScript and emits the main JavaScript, a separate module
Worker, and a hashed `.wasm` asset. The example transfers `ArrayBuffer`
ownership between threads so image data is not copied by structured clone.

::: code-group

<<< ../../examples/browser-wasm/src/main.ts [src/main.ts]

<<< ../../examples/browser-wasm/src/image-worker.ts [src/image-worker.ts]

:::

The main thread owns DOM state, downloads, and Worker lifetime. The Worker owns
WASM initialization and codec execution. `worker.terminate()` is the hard
cancellation boundary; a later request creates a clean Worker and initializes
the runtime again.

## File input and download flow

The runnable example follows this browser-only path:

1. `File.arrayBuffer()` reads the selected local file.
2. `postMessage(request, [bytes])` transfers the buffer to the Worker.
3. The Worker wraps it in `Uint8Array` and runs the matching built-in plugin.
4. The optimized buffer is transferred back to the main thread.
5. `Blob` and `URL.createObjectURL()` provide a local download.
6. The previous object URL is revoked before another result is exposed.

Nothing in that flow uploads the image. If application code sends the bytes to
a server, that is a separate application behavior rather than a requirement
of `@imagemin-rs/wasm`.

## Initialization and asset control

For Vite and other bundlers that understand package assets, the normal path is:

```ts
import { initWasm } from "@imagemin-rs/wasm";

await initWasm();
```

The generated loader locates the adjacent hashed WASM asset. Applications that
copy the WASM binary to a controlled URL can pass the response explicitly:

```ts
const response = await fetch("/assets/imagemin_wasm_core_bg.wasm");
if (!response.ok) throw new Error(`WASM request failed: ${response.status}`);

await initWasm(response);
```

`initWasm()` also accepts a URL, byte buffer, or compiled
`WebAssembly.Module`. Concurrent calls share one initialization promise. A
failed attempt may be retried after the asset problem is fixed.

## Deployment checklist

- Deploy the Worker chunk and `.wasm` asset together with the application
  JavaScript; do not copy only the entry chunk.
- Serve `.wasm` as `application/wasm`. The loader can fall back to buffered
  instantiation, but the correct MIME type enables streaming compilation.
- When assets use another origin, allow that origin through CORS and verify
  that redirects preserve the headers.
- Cache content-hashed Worker/WASM assets as immutable. Do not apply the same
  long-lived policy to HTML that points at those hashes.
- Include the Worker and WASM locations in the application's CSP. Exact
  `worker-src`, `script-src`, and fetch policy depends on the deployment; test
  the production header rather than disabling CSP.
- In SSR frameworks, create the Worker only on the client—for example in a
  mounted hook or event handler. `window` and `Worker` do not exist during
  server rendering.
- Validate the final deployed URL in Chromium, Firefox, and WebKit rather than
  relying only on the development server.

## Errors and recovery

Catch `ImageminError` and record its stable `code` plus optional `plugin`:

| Code                           | Meaning                                       |
| ------------------------------ | --------------------------------------------- |
| `ERR_IMAGEMIN_WASM_LOAD`       | JS glue or the WASM asset failed to load.     |
| `ERR_IMAGEMIN_INVALID_INPUT`   | Input is not bytes or exceeds the size limit. |
| `ERR_IMAGEMIN_INVALID_OPTIONS` | A plugin option or signal is invalid.         |
| `ERR_IMAGEMIN_CODEC`           | The selected codec rejected the image.        |
| `ERR_IMAGEMIN_ABORTED`         | Work was aborted between executable steps.    |
| `ERR_IMAGEMIN_PLUGIN`          | A custom browser plugin failed.               |

After a load failure, fix the URL, MIME, CORS, or CSP problem and call
`initWasm()` again. After terminating a Worker, discard outstanding request
IDs and create a new Worker before accepting more jobs, as the example does.

## Supported browser profiles

| Factory         | Input | Notes                                                  |
| --------------- | ----- | ------------------------------------------------------ |
| `giflossless()` | GIF   | Preserves animation frames and timing.                 |
| `oxipng()`      | PNG   | Lossless; never keeps a larger result.                 |
| `optipng()`     | PNG   | OptiPNG-compatible options backed by the Rust profile. |
| `svgm()`        | SVG   | Bounded safe/default native SVG profiles.              |

JPEG, WebP, AVIF, Gifsicle, and pngquant remain Node-only in 1.0. The
[Browser WASM API](/api/wasm) documents every option and the exact runtime
boundary. The [Playground](/playground) is a deployed Worker-based application
that can be used for a quick manual check.
