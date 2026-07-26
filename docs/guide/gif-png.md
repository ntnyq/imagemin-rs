# GIF 与无损 PNG

Phase 2 提供两条 GIF 路径和两条无损 PNG 路径。兼容入口沿用 imagemin 插件
名称；显式原生入口暴露许可更简单、可进入 napi-rs worker pool 的 profile。

## `gifsicle()`：兼容 sidecar

```ts
import imagemin, { gifsicle } from "imagemin-rs";

const output = await imagemin.buffer(input, {
  plugins: [gifsicle({ optimizationLevel: 3, colors: 128 })],
});
```

支持 `interlaced`、`optimizationLevel: 1 | 2 | 3` 与 `colors: 2..256`。未指定
`optimizationLevel` 时不会偷偷补入 level 1，这与 `imagemin-gifsicle@7.0.0`
的真实代码一致。

该入口执行 `gifsicle@5.3.0` 提供的独立 GPL executable，不链接进 MIT native
addon。普通 application extensions 默认删除，NETSCAPE loop、frame delays 和
动画语义保留。进程限制为 256 MiB 输入、512 MiB stdout、1 MiB stderr 与 120 秒。

`colors` 是有损量化。不同平台安装到的 Gifsicle patch release 可能不同，因此
不承诺跨平台逐字节确定性。

## `giflossless()`：原生保守优化

```ts
import { giflossless } from "imagemin-rs";

const output = await giflossless({ strip: false })(input);
```

此入口通过 napi-rs `AsyncTask` 使用 permissive Rust parser/compositor。它只在
逐帧合成像素可证明等价时重编码为 global palette 与 delta rectangles；颜色超过
256、opaque → transparent 等不能安全表达的动画会原样返回。默认保留 metadata，
`strip:true` 删除 comment/application metadata，但保留 loop。

`giflossless()` 不支持 `colors` 或 Gifsicle optimization levels。需要这些能力时
使用 `gifsicle()`。

## `optipng()`：OptiPNG-shaped native profile

```ts
import { optipng } from "imagemin-rs";

const output = await optipng({
  optimizationLevel: 3,
  bitDepthReduction: true,
  colorTypeReduction: true,
  paletteReduction: true,
  interlaced: false,
  errorRecovery: true,
})(input);
```

默认值与 `imagemin-optipng@8.0.0` 一致，并总是删除 ancillary metadata。显式
`interlaced:null` 保持输入状态；默认 `false` 强制 non-interlaced。level 0 按
OptiPNG `-nx -nz` 语义关闭 reductions/IDAT recoding；level 7 使用 Oxipng 6 的
最接近 profile。

底层是 `oxipng@10.1.1`，不是 OptiPNG 0.7.7，因此不承诺相同的 trial 数、repair
集合或输出 bytes。metadata stripping、interlace 转换和 repair 优先于 keep-smaller，
极小文件可能变大。

APNG 是明确的 pass-through：OptiPNG 0.7.7 早于 APNG，而 `strip all` 会删除
animation chunks。项目在拥有 APNG-aware encoder 和逐帧 oracle 前不会静默把动画
降级为静态 PNG。

## `oxipng()`：原生 Oxipng profile

`oxipng()` 保留 Oxipng 自己的 0..6 presets、`strip: "none" | "safe" | "all"`、
`optimizeAlpha` 与 `interlace`。它只采用更小或等大的结果。两个 PNG 工厂不能互换
理解：一个兼容 imagemin option shape，一个直接表达 Oxipng policy。
