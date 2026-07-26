# Node API

## `imagemin(inputs, options?)`

读取、顺序优化并可选写入多个文件。

```ts
const files = await imagemin(["images/*.png"], {
  concurrency: 4,
  destination: "dist/images",
  plugins: [oxipng()],
  signal: controller.signal,
});
```

`glob: false` 时把 input 当作精确路径；两种模式都会过滤 `.DS_Store` 等 filesystem junk。
glob 模式与上游一致地把 pattern 中的反斜杠转换为正斜杠（Windows 路径可直接使用），并按
路径排序返回——上游依赖 globby 的异步遍历顺序在多目录时不确定，本包保证可复现顺序，
文件集合与上游一致。`concurrency` 是 `1..32` 的整数，默认 `min(4, available CPUs)`。并发
执行仍按该顺序返回，首个失败会停止调度尚未开始的文件，错误包含 `sourcePath`。写入
destination 时使用源文件 basename；格式转换会按最终 magic 更新扩展名（上游只改写
`.webp`）。

## `imagemin.buffer(input, options?)`

兼容入口，返回优化后的 `Promise<Uint8Array>`。

文件、buffer 和 `optimize()` 均接受 `signal?: AbortSignal`。内置 sidecar 会在 abort 时终止
child process；未开始的文件不会再调度。原生 `AsyncTask` 和不知道 signal 的第三方插件无法
强制停止底层 CPU 工作，但公开 Promise 会立即以 `ERR_IMAGEMIN_ABORTED` 拒绝；支持协作取消
的第三方插件可从可选第二参数读取 `context.signal`。

```ts
type ImageminPlugin = (
  input: Uint8Array,
  context?: { signal?: AbortSignal },
) => Uint8Array | PromiseLike<Uint8Array>;
```

## `optimize(input, options?)`

返回：

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

Phase 0 原型插件：

```ts
interface OxipngOptions {
  optimizationLevel?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  strip?: "none" | "safe" | "all";
  optimizeAlpha?: boolean;
  interlace?: boolean;
}
```

`optimizeAlpha` 会改变完全透明像素的隐藏 RGB 值，虽然渲染通常不变，仍属于有损变换，因此默认关闭。

未知 options 和越界值会报 `ERR_IMAGEMIN_INVALID_OPTIONS`，不会静默忽略。

## `svgo(options?)`

`imagemin-svgo@12` 兼容工厂，内部固定 `svgo@4.0.2`。`SvgoOptions` 直接采用 SVGO 4 `Config`，包括 custom plugin；默认补入 `multipass: true`。这是 JavaScript 兼容执行器，不进入原生插件融合。

## `svgm(options?)`

显式原生 SVG 工厂，通过 napi-rs `AsyncTask` 使用 `svgm-core@0.3.8`：

```ts
interface SvgmOptions {
  preset?: "safe" | "default";
  precision?: number;
  passOverrides?: Partial<Record<SvgmPassName, boolean>>;
}
```

`precision` 只能是 `0..15` 的整数。pass 名称是封闭 union；未知字段不会被忽略。安全/兼容边界见 [SVG 优化](../guide/svg.md)。

## `gifsicle(options?)`

`imagemin-gifsicle@7` 兼容工厂，支持 `interlaced`、`optimizationLevel: 1..3`
与 `colors: 2..256`。它执行独立 GPL Gifsicle sidecar，不进入 native plugin
fusion；完整许可与确定性边界见 [GIF 与无损 PNG](../guide/gif-png.md)。

## `giflossless(options?)`

原生 permissive GIF profile，在 worker pool 中做逐帧等价的 delta 重编码：

```ts
interface GiflosslessOptions {
  strip?: boolean;
}
```

## `optipng(options?)`

`imagemin-optipng@8` option shape 的原生语义映射。默认 level 3、三类 reduction
开启、non-interlaced、error recovery 开启，并始终 strip all。Oxipng 与 OptiPNG
算法不同，不承诺 byte parity。

## `pngquant(options?)`

`imagemin-pngquant@10` 兼容工厂，支持 `speed`、`strip`、`quality`、`dithering`
与 `posterize`。它执行独立 GPL pngquant sidecar；quality floor 失败返回原输入，
APNG 为防止动画丢失而 no-op。完整边界见 [PNG 有损量化](../guide/pngquant.md)。

## `mozjpeg(options?)`

`imagemin-mozjpeg@10` 兼容工厂，支持 quality、progressive、trellis、tune、DCT、
quant table、sampling 等完整公开 option shape。它执行独立 MozJPEG cjpeg sidecar，
默认生成 progressive JPEG，并修复上游 `quantBaseline:true` 的参数 bug。

## `jpegtran(options?)`

`imagemin-jpegtran@8` 兼容工厂：

```ts
interface JpegtranOptions {
  progressive?: boolean;
  arithmetic?: boolean;
}
```

它在 JPEG coefficients 上无损，但为兼容上游固定删除 EXIF、ICC 与 comment；完整
metadata 与发布边界见 [JPEG 优化](../guide/jpeg.md)。

## `webp(options?)`

`imagemin-webp@8` 兼容工厂，支持 preset、quality/alphaQuality、method、target size、
SNS/filter、lossless/near-lossless、crop/resize 与 ICC/EXIF/XMP metadata。PNG、JPEG、
TIFF 和静态 WebP 会转为 WebP；APNG、animated WebP 与 multi-page TIFF 为防止内容
丢失而 no-op。

文件入口会根据最终 magic 把 destination 扩展名改为 `.webp`。上游会忽略多个合法
零值，本项目将它们正确传给 cwebp；完整类型与差异见 [WebP 转码](../guide/webp.md)。

## `avif(options?)`

`imagemin-avif@0.1.6` 兼容工厂，通过隔离的 Sharp/libheif worker 把静态 PNG、JPEG、
GIF、WebP、TIFF 或 AVIF 转为 8-bit AVIF：

```ts
interface AvifOptions {
  quality?: number; // integer 1..100，默认 90
  lossless?: boolean;
  effort?: number; // integer 0..9，0 最快
  speed?: number; // integer 0..8，端点映射为 effort 9..0
  chromaSubsampling?: "4:2:0" | "4:4:4";
  bitdepth?: 8;
}
```

`effort` 与 `speed` 不能同时使用。APNG、animated GIF/WebP/AVIF 与 multi-page TIFF
原样返回；文件入口会把成功转码的 destination 扩展名改为 `.avif`。完整默认值、
上游 bug 修复和资源边界见 [AVIF 转码](../guide/avif.md)。

## 稳定错误码

公开错误使用 `ImageminError`，当前错误码包括 invalid input/options、plugin output/plugin、
codec、I/O、native load、unsupported plugin 与 `ERR_IMAGEMIN_ABORTED`。文件批处理失败保留
具体 `sourcePath`，codec/plugin 错误保留 `plugin`。批处理不是事务：abort 或失败前已经完成的
独立文件不会回滚。

公开 pipeline 的单输入上限为 256 MiB；文件入口在读取前先检查 metadata，读取后仍会再次
检查实际 `Uint8Array`，各 codec 还会施加更严格的像素、帧数、metadata 和输出上限。
