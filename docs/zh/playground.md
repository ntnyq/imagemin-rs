---
title: 图片 Playground
description: 在浏览器中直接调整并优化本地图片。
pageClass: image-playground-page
aside: false
outline: false
---

# 图片 Playground

拖入一组本地图片，调整输出格式、质量与尺寸，然后比较优化前后的文件大小。可以单独下载，
也可以把全部结果打包为一个 ZIP。

<ClientOnly>
  <ImagePlayground locale="zh" />
</ClientOnly>

## 工作方式

Playground 在 Web Worker 中运行 `@imagemin-rs/wasm`。不需要缩放的 PNG 会直接交给
共享 Rust Oxipng codec，避免经过浏览器解码与重新编码；缩放后的 PNG 先经 Canvas
渲染，再由 WASM 优化。JPEG 与 WebP 输出仍使用浏览器 Canvas encoder。

文件选择与拖放分别由 VueUse 的 `useFileDialog` 和 `useDropZone` 处理，`useObjectUrl`
管理本地预览；图片不会上传到服务器。结果卡片会标明每张输出实际使用的引擎。

WASM 包与 Node.js runtime 共享 Rust codec 行为，但不包含 N-API、文件 API 或外部可执行
sidecar。Canvas 输出仍可能因浏览器而异。完整 codec 和文件管线请使用
[Node API](/zh/api/)，浏览器 runtime 契约见[浏览器 WASM API](/zh/api/wasm)。

## 支持的输入

- 静态 PNG、JPEG 与 WebP
- 单个队列最多 30 张图片
- 单张图片不超过 50 MB

动画图片会被 Playground 明确排除，因为缩放或转换经过 Canvas 时只能保留一帧。底层
WASM 包已支持 `giflossless()`，直接处理 GIF 字节的应用可以保留所有帧。
