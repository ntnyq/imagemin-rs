# JPEG Optimization

The two JPEG adapters have different semantics: `mozjpeg()` re-encodes pixels
and supports lossy quality control, while `jpegtran()` transforms JPEG
coefficients losslessly but removes marker metadata to match upstream.

## MozJPEG

```ts
import imagemin, { mozjpeg } from "imagemin-rs";

const output = await imagemin.buffer(input, {
  plugins: [
    mozjpeg({
      quality: 80,
      progressive: true,
      tune: "ssim",
    }),
  ],
});
```

`mozjpeg()` targets `imagemin-mozjpeg@10.0.0`:

```ts
interface MozjpegOptions {
  quality?: number; // 0..100
  progressive?: boolean;
  targa?: boolean;
  revert?: boolean;
  fastCrush?: boolean;
  dcScanOpt?: number; // integer 0..2
  trellis?: boolean;
  trellisDC?: boolean;
  tune?: "psnr" | "hvs-psnr" | "ssim" | "ms-ssim";
  overshoot?: boolean;
  arithmetic?: boolean;
  dct?: "int" | "fast" | "float";
  quantBaseline?: boolean;
  quantTable?: number; // integer 0..5
  smooth?: number; // integer 1..100
  maxMemory?: number; // positive safe integer
  sample?: string[]; // for example ["2x2", "1x1", "1x1"]
}
```

Progressive JPEG is the default. Fixed fixtures match
`imagemin-mozjpeg@10.0.0` byte-for-byte across default and advanced option
matrices. One upstream bug is intentionally fixed: `quantBaseline: true` emits
the correct valueless flag instead of an extra `true` filename.

## jpegtran

```ts
import imagemin, { jpegtran } from "imagemin-rs";

const output = await imagemin.buffer(input, {
  plugins: [jpegtran({ progressive: true })],
});
```

```ts
interface JpegtranOptions {
  progressive?: boolean;
  arithmetic?: boolean;
}
```

Like `imagemin-jpegtran@8.0.0`, this adapter always uses `-copy none`.
Pixels and DCT coefficients remain lossless, but EXIF orientation, ICC
profiles, and comments are removed. Do not use this compatibility entry point
when those metadata are required for correct display.

## Isolation and release boundary

Both adapters execute constrained sidecars rather than linking their codec into
the MIT native addon. Limits cover input, output, stderr, execution time, and
decoded dimensions. Non-JPEG input passes through; malformed JPEG-signature
input returns a codec error.

Production packages contain project-built MozJPEG 4.1.1 `cjpeg` and
`jpegtran`, binary hashes, source provenance, and complete licenses. Byte
parity is promised only within the pinned encoder version.
