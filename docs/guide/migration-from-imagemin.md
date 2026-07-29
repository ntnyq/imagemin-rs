# Migrating from imagemin

imagemin-rs keeps the familiar file and buffer APIs while collecting the core
pipeline and built-in codec factories in one package. Migration can therefore
start as an import change and then adopt stricter behavior deliberately.

## Install the release candidate

```sh
pnpm remove imagemin imagemin-svgo imagemin-gifsicle imagemin-optipng
pnpm add imagemin-rs@next
```

Keep any third-party imagemin plugins that are not replaced by a built-in
factory. Optional dependencies must remain enabled because they contain the
native binding and codec executables for the current platform.

## Replace imports

```ts
// Before
import imagemin from "imagemin";
import imageminMozjpeg from "imagemin-mozjpeg";
import imageminPngquant from "imagemin-pngquant";
import imageminSvgo from "imagemin-svgo";

// After
import imagemin, { mozjpeg, pngquant, svgo } from "imagemin-rs";
```

The file and buffer call shapes remain familiar:

```ts
await imagemin(["images/**/*.{png,jpg,svg}"], {
  destination: "dist/images",
  plugins: [svgo(), pngquant(), mozjpeg({ quality: 80 })],
});

const output = await imagemin.buffer(input, {
  plugins: [mozjpeg({ quality: 80 })],
});
```

Third-party function plugins can remain in the same array. They receive a Node
`Buffer`, run strictly in array order, and keep their normal error propagation.

## Choose the intended codec profile

| Existing plugin     | imagemin-rs factory | Compatibility boundary                                            |
| ------------------- | ------------------- | ----------------------------------------------------------------- |
| `imagemin-svgo`     | `svgo()`            | Full SVGO 4 configuration path                                    |
| —                   | `svgm()`            | Bounded native SVG profile; not full SVGO configuration           |
| `imagemin-gifsicle` | `gifsicle()`        | Compatible GPL sidecar                                            |
| —                   | `giflossless()`     | Permissively licensed native lossless profile                     |
| `imagemin-optipng`  | `optipng()`         | Option-shape compatibility through Oxipng; no byte-parity promise |
| `imagemin-pngquant` | `pngquant()`        | Compatible GPL sidecar                                            |
| `imagemin-mozjpeg`  | `mozjpeg()`         | Compatible MozJPEG sidecar with documented upstream bug fixes     |
| `imagemin-jpegtran` | `jpegtran()`        | Coefficient-lossless output; strips EXIF, ICC, and comments       |
| `imagemin-webp`     | `webp()`            | Compatible static conversion with safer zero-value handling       |
| `imagemin-avif`     | `avif()`            | Opt-in 8-bit static conversion; install `sharp@0.35.3`            |

Read the individual codec guide before changing between compatibility and
native profiles.

Unlike `imagemin-avif`, imagemin-rs does not install Sharp transitively. Add
the exact optional peer explicitly when the migrated pipeline uses `avif()`.

## Review intentional differences

imagemin-rs makes several behaviors deterministic or explicit:

- glob results are path-sorted and Windows backslashes are normalized;
- destination extensions follow final file magic after format conversion;
- unknown and out-of-range built-in options reject with
  `ERR_IMAGEMIN_INVALID_OPTIONS`;
- `concurrency` defaults to at most four and can be set from 1 to 32;
- `AbortSignal` stops new file scheduling and terminates built-in sidecars;
- native tasks and non-cooperating third-party plugins can reject immediately
  on abort but cannot have their underlying CPU work forcibly preempted;
- APNG, animated images, and multi-page inputs pass through where a static
  encoder would otherwise discard content.

These differences should be covered by application-level tests during
migration instead of being treated as byte-for-byte implementation details.

## Validate the migration

1. Run the old and new pipelines over the same representative corpus.
2. Compare decoded pixels, frames, metadata policy, and output extensions—not
   only file size or bytes.
3. Exercise corrupt inputs and assert stable `ImageminError.code` values.
4. Test a clean production install on every deployment platform.
5. Preserve optional dependencies in bundlers, containers, and deployment
   pruning steps.

See [Troubleshooting](./troubleshooting.md) for native-load and sidecar
diagnostics, and the [Node API](../api/index.md) for the complete option surface.
