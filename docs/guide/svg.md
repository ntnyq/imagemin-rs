# SVG Optimization

imagemin-rs provides two deliberately separate SVG paths: `svgo()` targets
imagemin-svgo configuration compatibility, while `svgm()` provides bounded
native execution. They are not aliases for the same engine.

## `svgo()`: compatibility first

```ts
import imagemin, { svgo } from "imagemin-rs";

const output = await imagemin.buffer(input, {
  plugins: [
    svgo({
      multipass: false,
      plugins: [
        {
          name: "preset-default",
          params: { overrides: { removeDesc: false } },
        },
        "removeScripts",
      ],
    }),
  ],
});
```

The compatibility baseline is `imagemin-svgo@12.0.0`, `svgo@4.0.2`, and
`is-svg@6.1.0`. `multipass` defaults to `true`; `path`, `floatPrecision`,
`plugins`, `js2svg`, `datauri`, and custom JavaScript plugins are passed to
SVGO. Non-SVG input is returned unchanged.

Full SVGO runs synchronously on the JavaScript main thread. Its Promise is only
the plugin protocol, so evaluate `svgm()` for very large SVGs or
latency-sensitive applications.

## `svgm()`: native first

```ts
import imagemin, { svgm } from "imagemin-rs";

const output = await imagemin.buffer(input, {
  plugins: [
    svgm({
      preset: "safe",
      precision: 3,
      passOverrides: {
        removeComments: false,
      },
    }),
  ],
});
```

`svgm()` uses `svgm-core@0.3.8` in the napi-rs worker pool. Its options form a
closed native profile:

```ts
interface SvgmOptions {
  preset?: "safe" | "default";
  precision?: number; // 0..15
  passOverrides?: Partial<Record<SvgmPassName, boolean>>;
}
```

The safe preset preserves titles, accessible descriptions, and `viewBox`.
Native input must be strict UTF-8 and may not contain DTD or entity
declarations. Limits include 16 MiB, 100,000 nodes, and 256 nesting levels.
Unknown options fail with `ERR_IMAGEMIN_INVALID_OPTIONS`; policy rejection uses
`ERR_IMAGEMIN_INVALID_INPUT`.

## Compatibility boundary

| Capability                                   | `svgo()`    | `svgm()`                |
| -------------------------------------------- | ----------- | ----------------------- |
| imagemin-svgo multipass default              | Yes         | Fixed-point convergence |
| SVGO plugin parameters and ordering          | Yes         | No                      |
| Custom JavaScript plugin functions           | Yes         | No                      |
| `path`, `js2svg`, and `datauri`              | Yes         | No                      |
| napi-rs worker pool                          | No          | Yes                     |
| Hard limits for DTD, depth, nodes, and bytes | SVGO policy | Yes                     |

Neither path is an SVG sanitizer. Do not rely on the defaults to remove
scripts, event attributes, `javascript:` URLs, or external resource references
from untrusted SVG.
