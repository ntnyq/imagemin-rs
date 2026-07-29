# imagemin-rs

An imagemin-compatible image optimization pipeline powered by Rust and
napi-rs. It provides the familiar file and buffer APIs plus plugin factories
for SVG, GIF, PNG, JPEG, WebP, and AVIF.

```sh
pnpm add imagemin-rs@next
```

```ts
import imagemin, { avif, mozjpeg, pngquant, svgo } from "imagemin-rs";

await imagemin(["images/*.{png,jpg,svg}"], {
  destination: "dist/images",
  plugins: [svgo(), pngquant(), mozjpeg({ quality: 80 })],
});

const output = await imagemin.buffer(input, {
  plugins: [avif({ effort: 6, quality: 80 })],
});
```

Requires Node.js 22.13 or newer. Native packages and codec dependencies are
selected automatically for supported platforms; installation must retain
optional dependencies.

AVIF is the exception: `sharp` is not installed by default. Projects using
`avif()` must opt in with `pnpm add sharp@0.35.3`. Every other plugin works
without Sharp.

See the [full documentation](https://imagemin-rs.ntnyq.dev/) and
[third-party notices](./THIRD_PARTY_NOTICES.md). Released under the MIT License.
