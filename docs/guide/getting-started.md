# Getting Started

## Install

```sh
pnpm add imagemin-rs@next
```

imagemin-rs requires Node.js 22.13 or newer. Native packages are provided for
supported macOS, Linux, and Windows targets. Keep optional dependencies enabled:
they carry the native binding and codec executables for the current platform.

The package uses npm's `next` tag during the release-candidate period. The
unqualified `pnpm add imagemin-rs` command will become the recommended command
after the stable release.

## Optimize a buffer

```ts
import imagemin, { oxipng } from "imagemin-rs";

const output = await imagemin.buffer(input, {
  plugins: [
    oxipng({
      optimizationLevel: 3,
      strip: "safe",
    }),
  ],
});
```

## Process files concurrently

```ts
const controller = new AbortController();

const files = await imagemin(["images/**/*.{png,jpg,svg}"], {
  concurrency: 4,
  destination: "dist/images",
  plugins: [oxipng()],
  signal: controller.signal,
});

// controller.abort();
```

The file API processes up to four files at once by default, lowers that limit
on smaller machines, and preserves deterministic result order. Built-in
sidecars terminate their child process on cancellation; completed destination
files are not rolled back.

## Inspect optimization statistics

```ts
import { optimize, oxipng } from "imagemin-rs";

const result = await optimize(input, {
  plugins: [oxipng()],
});

console.log({
  format: result.format,
  inputBytes: result.inputBytes,
  outputBytes: result.outputBytes,
  steps: result.steps,
});
```

## Compose existing imagemin plugins

Function plugins can be inserted directly:

```ts
const customPlugin = async (input: Uint8Array) => {
  return new Uint8Array(input);
};

const output = await imagemin.buffer(input, {
  plugins: [oxipng(), customPlugin],
});
```

Plugins run strictly in array order. Adjacent native plugins may be fused
internally, but execution is never reordered across a JavaScript plugin.

Choose `svgo()` for full imagemin-svgo configuration compatibility or `svgm()`
for bounded worker-pool execution. For PNG and JPEG, choose between lossless
and lossy adapters according to the codec guides. `webp()` and `avif()` convert
supported static images and update destination extensions based on output
magic.

You can also try common browser-supported formats locally in the
[Playground](/playground). Uploaded files never leave the browser.

Migrating an existing project? Continue with
[Migrating from imagemin](./migration-from-imagemin.md). For native package,
sidecar, or deployment failures, see [Troubleshooting](./troubleshooting.md).
