# WebP Conversion

`webp()` targets `imagemin-webp@8.0.0` and sends PNG, JPEG, TIFF, or static
WebP input to a pinned cwebp sidecar. This changes the format; the file API
updates the destination extension to `.webp` from the final content.

## Usage

```ts
import imagemin, { webp } from "imagemin-rs";

const output = await imagemin.buffer(input, {
  plugins: [
    webp({
      quality: 80,
      alphaQuality: 90,
      method: 6,
    }),
  ],
});
```

```ts
interface WebpOptions {
  preset?: "default" | "photo" | "picture" | "drawing" | "icon" | "text";
  quality?: number; // 0..100
  alphaQuality?: number; // 0..100
  method?: number; // integer 0..6
  size?: number; // target bytes
  sns?: number; // 0..100
  filter?: number; // 0..100
  autoFilter?: boolean;
  sharpness?: number; // integer 0..7
  lossless?: boolean | number; // numeric preset 0..9
  nearLossless?: number; // 0..100
  crop?: { x: number; y: number; width: number; height: number };
  resize?: { width: number; height: number };
  metadata?: "all" | "none" | "exif" | "icc" | "xmp" | WebpMetadata[];
}
```

Crop is applied before resize. Unknown and out-of-range fields fail
synchronously.

## Intentional upstream differences

Upstream uses truthiness to construct arguments and therefore drops valid zero
values. imagemin-rs correctly passes `quality: 0`, `method: 0`,
`alphaQuality: 0`, `sns: 0`, `filter: 0`, `sharpness: 0`, `lossless: 0`, and
`nearLossless: 0` to cwebp. Other declared options match upstream byte-for-byte
when tested against the same binary.

APNG, animated WebP, and multi-page TIFF pass through because cwebp cannot
preserve their complete contents. GIF is not a cwebp input.

## Lossless, alpha, and metadata

Lossless WebP preserves alpha and visible pixels. libwebp may normalize hidden
RGB values where alpha is zero, so tests compare exact RGBA on visible pixels
and composite lossy results against black and white backgrounds.

The default metadata policy is `none`. A selection such as
`metadata: ["icc", "exif"]` writes the corresponding RIFF chunks.

Production packages contain project-built cwebp/libwebp 1.6.0 with pinned
dependencies, source digests, binary SHA-256 values, and complete licenses.
There is no runtime download or local-build fallback.
