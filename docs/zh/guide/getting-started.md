# 快速开始

## 安装

```sh
pnpm add imagemin-rs@next
```

要求 Node.js 22.13+。受支持的 macOS、Linux 与 Windows 平台均提供原生包。安装时必须
保留 optional dependencies，因为当前平台的原生 binding 和 codec 可执行文件由这些包提供。

发布候选阶段统一使用 npm `next` tag；稳定版发布后才会把不带 tag 的
`pnpm add imagemin-rs` 作为推荐命令。

首个稳定版将 AVIF 设为显式 opt-in。只有调用 `avif()` 的项目才需要安装固定版本的
可选 peer：

```sh
pnpm add sharp@0.35.3
```

导入 imagemin-rs 以及使用其他所有插件都不会安装或加载 Sharp。未安装 peer 时，
可转换的 AVIF 输入会返回稳定且包含安装命令的错误。

## Buffer 优化

```ts
import imagemin, { oxipng } from "imagemin-rs";

const output = await imagemin.buffer(input, {
  plugins: [
    oxipng({
      optimizationLevel: 3,
      strip: "safe",
    }),
  ],
});
```

## 批量并发与取消

```ts
const controller = new AbortController();

const files = await imagemin(["images/**/*.{png,jpg,svg}"], {
  concurrency: 4,
  destination: "dist/images",
  plugins: [oxipng()],
  signal: controller.signal,
});

// controller.abort();
```

默认最多同时处理 4 个文件（CPU 更少时随 CPU 数降低），并保持结果顺序。内置 sidecar 会在
取消时终止子进程；已完成的目标文件不会回滚。

## 获取统计

```ts
import { optimize, oxipng } from "imagemin-rs";

const result = await optimize(input, {
  plugins: [oxipng()],
});

console.log({
  format: result.format,
  inputBytes: result.inputBytes,
  outputBytes: result.outputBytes,
  steps: result.steps,
});
```

## 与现有 imagemin 插件组合

旧式插件函数可直接插入：

```ts
const customPlugin = async (input: Uint8Array) => {
  return new Uint8Array(input);
};

const output = await imagemin.buffer(input, {
  plugins: [oxipng(), customPlugin],
});
```

单个图片内严格按数组顺序执行。连续原生插件会在内部融合；不会越过 JavaScript 插件重排。

SVG 有两种明确选择：完整 `imagemin-svgo` 配置使用 `svgo()`；需要 worker-pool 和资源上限时使用 `svgm()`。详见 [SVG 优化](./svg.md)。

PNG 有损量化使用独立 `pngquant()` sidecar；JPEG 可在有损 `mozjpeg()` 与系数无损、
但会删除 metadata 的 `jpegtran()` 之间选择。详见 [PNG 有损量化](./pngquant.md) 与
[JPEG 优化](./jpeg.md)。

PNG/JPEG/TIFF 转 WebP 使用 `webp()`；文件入口会把输出扩展名更新为 `.webp`，并对
动画/多页输入保守 no-op。详见 [WebP 转码](./webp.md)。

显式安装 Sharp 后，静态 PNG/JPEG/GIF/WebP/TIFF 转 AVIF 使用隔离的 `avif()`
worker；多帧和多页输入保守 no-op。详见 [AVIF 转码](./avif.md)。

也可以在[浏览器 Playground](/zh/playground) 中直接处理浏览器支持的常见格式。上传的
图片只在本地浏览器中处理，不会发送到服务器。

## 在浏览器或 Web Worker 中运行

无法使用 Node.js native binding 与文件 API 时，安装独立的纯内存 WASM 包：

```sh
pnpm add @imagemin-rs/wasm@next
```

```ts
import { initWasm, optimize, oxipng } from "@imagemin-rs/wasm";

await initWasm();

const result = await optimize(input, {
  plugins: [oxipng({ optimizationLevel: 3 })],
});
```

浏览器包支持 `giflossless`、`oxipng`、`optipng` 与 `svgm`，不包含路径、glob、
N-API 或外部可执行 sidecar。可运行应用、文件下载、强制取消与部署步骤见
[浏览器与 Web Worker 指南](./browser-wasm.md)，完整 runtime 契约见
[浏览器 WASM API](/zh/api/wasm)。

从现有 imagemin 项目迁移时，请继续阅读[从 imagemin 迁移](./migration-from-imagemin.md)。
原生包、sidecar 或部署失败见[安装与运行排错](./troubleshooting.md)。
