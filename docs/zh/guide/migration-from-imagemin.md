# 从 imagemin 迁移

imagemin-rs 保留熟悉的文件与 Buffer API，并把 core pipeline 和内置 codec factory
集中到一个包中。迁移可以先从 import 替换开始，再逐项确认更严格的行为。

## 安装发布候选版

```sh
pnpm remove imagemin imagemin-svgo imagemin-gifsicle imagemin-optipng
pnpm add imagemin-rs@next
```

没有对应内置 factory 的第三方 imagemin 插件可以继续保留。必须启用 optional
dependencies，因为其中包含当前平台的原生 binding 和 codec 可执行文件。

## 替换 import

```ts
// 迁移前
import imagemin from "imagemin";
import imageminMozjpeg from "imagemin-mozjpeg";
import imageminPngquant from "imagemin-pngquant";
import imageminSvgo from "imagemin-svgo";

// 迁移后
import imagemin, { mozjpeg, pngquant, svgo } from "imagemin-rs";
```

文件和 Buffer 入口保持熟悉的调用形式：

```ts
await imagemin(["images/**/*.{png,jpg,svg}"], {
  destination: "dist/images",
  plugins: [svgo(), pngquant(), mozjpeg({ quality: 80 })],
});

const output = await imagemin.buffer(input, {
  plugins: [mozjpeg({ quality: 80 })],
});
```

第三方函数插件可以留在同一数组中。它们收到 Node `Buffer`，严格按数组顺序运行，并
保持原有错误传播行为。

## 选择正确的 codec profile

| 原插件              | imagemin-rs factory | 兼容边界                                          |
| ------------------- | ------------------- | ------------------------------------------------- |
| `imagemin-svgo`     | `svgo()`            | 完整 SVGO 4 配置路径                              |
| —                   | `svgm()`            | 有资源上限的原生 SVG profile，不等同于完整 SVGO   |
| `imagemin-gifsicle` | `gifsicle()`        | 兼容的 GPL sidecar                                |
| —                   | `giflossless()`     | permissive 原生无损 profile                       |
| `imagemin-optipng`  | `optipng()`         | 通过 Oxipng 映射 option shape，不承诺 byte parity |
| `imagemin-pngquant` | `pngquant()`        | 兼容的 GPL sidecar                                |
| `imagemin-mozjpeg`  | `mozjpeg()`         | 兼容 MozJPEG sidecar，并包含已记录的上游修复      |
| `imagemin-jpegtran` | `jpegtran()`        | coefficient 无损，但删除 EXIF、ICC 和 comment     |
| `imagemin-webp`     | `webp()`            | 静态转码兼容，并修复合法零值处理                  |
| `imagemin-avif`     | `avif()`            | opt-in 8-bit 静态转码；安装 `sharp@0.35.3`        |

在 compatibility 与 native profile 之间切换前，应先阅读对应 codec 指南。

与 `imagemin-avif` 不同，imagemin-rs 不会传递安装 Sharp。迁移后的 pipeline 使用
`avif()` 时，请显式添加这个精确版本的可选 peer。

## 检查有意差异

imagemin-rs 会把以下行为设为确定或显式：

- glob 结果按路径排序，并转换 Windows pattern 中的反斜杠；
- 格式转换后，destination 扩展名依据最终文件 magic；
- 未知或越界内置 option 以 `ERR_IMAGEMIN_INVALID_OPTIONS` 拒绝；
- `concurrency` 默认不超过 4，可配置范围是 1..32；
- `AbortSignal` 停止新文件调度，并终止内置 sidecar；
- 原生任务和不支持协作取消的第三方插件会立即拒绝公开 Promise，但底层 CPU 工作不能
  被强制抢占；
- APNG、动画和多页输入会在静态编码可能丢内容时原样返回。

迁移测试应覆盖这些应用层行为，不应只比较实现产生的字节。

## 验证迁移

1. 用相同的代表性 corpus 分别运行新旧 pipeline。
2. 比较解码像素、帧、metadata 策略和输出扩展名，而不只是体积或字节。
3. 覆盖损坏输入，并断言稳定的 `ImageminError.code`。
4. 在每个部署平台执行全新的 production install。
5. 确认 bundler、容器和部署裁剪流程不会删除 optional dependencies。

原生加载和 sidecar 诊断见[安装与运行排错](./troubleshooting.md)，完整 option surface
见 [Node API](../api/index.md)。
