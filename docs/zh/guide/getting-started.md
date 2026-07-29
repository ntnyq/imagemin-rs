# 快速开始

## 安装

```sh
pnpm add imagemin-rs
```

要求 Node.js 22.13+。受支持的 macOS、Linux 与 Windows 平台均提供原生包。

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

静态 PNG/JPEG/GIF/WebP/TIFF 转 AVIF 使用隔离的 `avif()` worker；多帧和多页输入保守
no-op。详见 [AVIF 转码](./avif.md)。

也可以在[浏览器 Playground](/zh/playground) 中直接处理浏览器支持的常见格式。上传的
图片只在本地浏览器中处理，不会发送到服务器。
