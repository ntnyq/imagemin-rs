# Node API

## `imagemin(inputs, options?)`

Reads, optimizes in plugin order, and optionally writes multiple files.

```ts
const files = await imagemin(["images/*.png"], {
  concurrency: 4,
  destination: "dist/images",
  plugins: [oxipng()],
  signal: controller.signal,
});
```

With `glob: false`, inputs are exact paths. Both modes filter filesystem junk
such as `.DS_Store`. Glob patterns normalize Windows backslashes and results
are path-sorted for reproducibility. `concurrency` is an integer from 1 to 32
and defaults to the smaller of 4 and the available CPU count.

Results preserve sorted input order. The first failure stops scheduling files
that have not started and includes `sourcePath` in the error. Destination files
use the input basename; format conversion updates the extension from the final
file magic.

## `imagemin.buffer(input, options?)`

The compatibility entry point returns a `Promise<Uint8Array>`.

File, buffer, and `optimize()` APIs accept `signal?: AbortSignal`. Built-in
sidecars terminate their child process when aborted. Native tasks and
third-party plugins that do not cooperate with the signal cannot stop
underlying CPU work, but the public Promise rejects immediately with
`ERR_IMAGEMIN_ABORTED`.

```ts
type ImageminPlugin = (
  input: Uint8Array,
  context?: { signal?: AbortSignal },
) => Uint8Array | PromiseLike<Uint8Array>;
```

Plugin input is a Node.js `Buffer`, which is a `Uint8Array` subclass. Existing
official plugins that guard with `Buffer.isBuffer()` therefore work without an
adapter.

## `optimize(input, options?)`

Returns optimized bytes and per-step statistics:

```ts
interface OptimizationResult {
  data: Uint8Array;
  format: "png" | "jpeg" | "gif" | "webp" | "avif" | "svg" | "unknown";
  inputBytes: number;
  outputBytes: number;
  steps: Array<{
    plugin: string;
    inputBytes: number;
    outputBytes: number;
    changed: boolean;
  }>;
}
```

## `oxipng(options?)`

```ts
interface OxipngOptions {
  optimizationLevel?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  strip?: "none" | "safe" | "all";
  optimizeAlpha?: boolean;
  interlace?: boolean;
}
```

`optimizeAlpha` changes hidden RGB values in fully transparent pixels and is
therefore disabled by default. Unknown or out-of-range options fail with
`ERR_IMAGEMIN_INVALID_OPTIONS`.

## `svgo(options?)`

An `imagemin-svgo@12` compatible factory pinned to `svgo@4.0.2`. `SvgoOptions`
uses the full SVGO `Config` type, including custom plugins, and defaults
`multipass` to `true`. It stays on the JavaScript compatibility path and does
not participate in native plugin fusion.

## `svgm(options?)`

A bounded native SVG factory using `svgm-core@0.3.8` in the napi-rs worker
pool:

```ts
interface SvgmOptions {
  preset?: "safe" | "default";
  precision?: number;
  passOverrides?: Partial<Record<SvgmPassName, boolean>>;
}
```

`precision` is an integer from 0 to 15 and pass names form a closed union. See
[SVG Optimization](../guide/svg.md) for the resource and compatibility
boundary.

## `gifsicle(options?)`

An `imagemin-gifsicle@7` compatible factory supporting `interlaced`,
`optimizationLevel: 1..3`, and `colors: 2..256`. It executes a separate GPL
Gifsicle sidecar and does not participate in native plugin fusion.

## `giflossless(options?)`

A permissively licensed native GIF profile that performs frame-equivalent
delta re-encoding:

```ts
interface GiflosslessOptions {
  strip?: boolean;
}
```

## `optipng(options?)`

A native semantic mapping of the `imagemin-optipng@8` option shape. It
defaults to level 3, enables three reduction classes, outputs non-interlaced
PNG, enables error recovery, and always strips metadata. The engine is Oxipng,
so byte parity with OptiPNG is not promised.

## `pngquant(options?)`

An `imagemin-pngquant@10` compatible factory supporting `speed`, `strip`,
`quality`, `dithering`, and `posterize`. It executes a separate GPL pngquant
sidecar. A failed quality floor returns the original input and APNG passes
through to preserve animation. See [Lossy PNG Quantization](../guide/pngquant.md).

## `mozjpeg(options?)`

An `imagemin-mozjpeg@10` compatible factory with quality, progressive scan,
trellis, tuning, DCT, quantization table, sampling, and other public options.
It executes a separate MozJPEG cjpeg sidecar, defaults to progressive output,
and fixes the upstream `quantBaseline: true` argument bug.

## `jpegtran(options?)`

```ts
interface JpegtranOptions {
  progressive?: boolean;
  arithmetic?: boolean;
}
```

The transformation is lossless in JPEG coefficient space, but the upstream
compatible behavior removes EXIF, ICC, and comments. See
[JPEG Optimization](../guide/jpeg.md) before using it on metadata-dependent
images.

## `webp(options?)`

An `imagemin-webp@8` compatible factory supporting preset, quality and alpha
quality, method, target size, SNS/filter controls, lossless and near-lossless
modes, crop/resize, and ICC/EXIF/XMP metadata.

PNG, JPEG, TIFF, and static WebP convert to WebP. APNG, animated WebP, and
multi-page TIFF pass through. File destinations update to `.webp`.

## `avif(options?)`

An `imagemin-avif@0.1.6` compatible factory that converts static PNG, JPEG,
GIF, WebP, TIFF, or AVIF through an isolated Sharp/libheif worker:

```sh
pnpm add sharp@0.35.3
```

```ts
interface AvifOptions {
  quality?: number; // integer 1..100, default 90
  lossless?: boolean;
  effort?: number; // integer 0..9
  speed?: number; // integer 0..8
  chromaSubsampling?: "4:2:0" | "4:4:4";
  bitdepth?: 8;
}
```

`effort` and `speed` are mutually exclusive. Animated and multi-page inputs
pass through; successful file conversion updates the extension to `.avif`.
Sharp is an optional peer and is not installed with the default package.
See [AVIF Conversion](../guide/avif.md) for defaults and resource limits.

## Stable errors and limits

Public failures use `ImageminError`. Stable codes cover invalid input/options,
plugin output and execution, codecs, I/O, native loading, unsupported plugins,
and `ERR_IMAGEMIN_ABORTED`. Batch failures retain `sourcePath`; codec and
plugin failures retain `plugin`.

Batch processing is not transactional: completed independent files are not
rolled back after an abort or later failure.

The public pipeline limits a single input to 256 MiB. File APIs check metadata
before reading and actual bytes after reading. Individual codecs impose
stricter pixel, frame, metadata, and output limits.
