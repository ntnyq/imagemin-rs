# AVIF Conversion

`avif()` targets the public shape and defaults of `imagemin-avif@0.1.6`. It
uses a pinned Sharp/libvips/libheif/libaom runtime in an isolated Node.js child
process so its native libraries never load into the caller.

Sharp is an optional peer and is not part of the default imagemin-rs install.
Opt in before converting AVIF:

```sh
pnpm add sharp@0.35.3
```

Non-convertible inputs still pass through without Sharp. A convertible input
without the peer rejects with `ERR_IMAGEMIN_CODEC`, `plugin: "avif"`, and the
installation command.

## Usage

```ts
import imagemin, { avif } from "imagemin-rs";

const output = await imagemin.buffer(input, {
  plugins: [
    avif({
      quality: 80,
      effort: 6,
      chromaSubsampling: "4:4:4",
    }),
  ],
});
```

```ts
interface AvifOptions {
  quality?: number; // integer 1..100, default 90
  lossless?: boolean; // default false
  effort?: number; // integer 0..9, 0 is fastest
  speed?: number; // integer 0..8, 8 is fastest
  chromaSubsampling?: "4:2:0" | "4:4:4"; // default 4:2:0
  bitdepth?: 8;
}
```

The community package declared `speed` but did not forward it. imagemin-rs
maps it proportionally to effort `9..0`; `speed` and `effort` cannot be used
together. Omitting both retains Sharp's default effort.

## Input and animation policy

Static PNG, JPEG, GIF, WebP, TIFF, and AVIF can be converted. SVG and unknown
formats pass through. Successful file conversion updates the extension to
`.avif`.

APNG, animated GIF/WebP/AVIF, and multi-page TIFF pass through. Sharp cannot
currently emit the required AVIF sequence, and silently keeping the first
frame or page would lose content.

Source metadata is stripped by default. JPEG EXIF orientation is applied to
the pixels before encoding, avoiding the upstream behavior that could remove
the tag without preserving display orientation.

## Compatibility and resource limits

This adapter intentionally fixes upstream global-default mutation, ignored
`speed`, unstable codec errors, and unsafe first-frame behavior. AVIF bytes
vary with Sharp, libheif, and libaom versions, so tests compare independently
decoded dimensions, alpha, lossless visible RGBA, and composited lossy error.

Each encode runs in a constrained worker with Sharp cache disabled and
concurrency set to one. Limits cover 256 MiB input, 512 MiB output, 16,384
pixels per side, 67,108,864 total pixels, bounded metadata and stderr, and
hard execution time. The packaged runtime currently supports 8-bit AVIF only.

The initial 1.0 scope keeps this opt-in boundary. Making Sharp a default
dependency again would reopen the LGPL and AOM distribution review.
