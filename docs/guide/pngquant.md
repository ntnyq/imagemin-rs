# Lossy PNG Quantization

`pngquant()` targets the `imagemin-pngquant@10.0.0` interface. It runs a
separate pngquant sidecar backed by libimagequant for RGBA palettes,
semi-transparent edges, and quality-floor behavior.

## Usage

```ts
import imagemin, { pngquant } from "imagemin-rs";

const output = await imagemin.buffer(input, {
  plugins: [
    pngquant({
      quality: [0.6, 0.8],
      speed: 3,
      dithering: 1,
      strip: true,
    }),
  ],
});
```

```ts
interface PngquantOptions {
  speed?: number; // integer 1..11
  strip?: boolean;
  quality?: [number, number]; // each value 0..1
  dithering?: number | boolean; // 0..1 or false
  posterize?: number;
}
```

When `speed` is omitted, the fixed binary chooses its default. `false`
dithering maps to upstream `--ordered`; numeric values map to
`--floyd=<value>`. If the quality floor cannot be met, pngquant exits with code
99 and the plugin returns the original input.

## Safety and compatibility

pngquant 3.0.3 and its pinned libimagequant source are GPL-3.0-or-later
executables invoked only through a child process. They are not linked into the
MIT native addon. Input, output, stderr, execution time, and decoded dimensions
all have hard limits.

Ordinary PNG results are byte-compared with `imagemin-pngquant@10.0.0` across
the option matrix. imagemin-rs additionally rejects unknown options
synchronously and passes APNG through to avoid silently losing animation.

Eight platform packages contain SHA-256 provenance, source references, and the
complete GPL license. There are no runtime downloads or installation-time
builds.
