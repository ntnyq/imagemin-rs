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

Playground 使用浏览器自身的图片解码器、Canvas 渲染器和编码器。文件选择与拖放分别由
VueUse 的 `useFileDialog` 和 `useDropZone` 处理，`useObjectUrl` 管理本地预览。图片不会
上传到服务器；Canvas 重新编码时会剥离原始 metadata。

这个浏览器引擎用于快速预览，不等同于 Node.js `imagemin-rs` runtime。输出可能因浏览器
而异，也不会调用项目固定版本的 SVGO、Gifsicle、Oxipng、pngquant、MozJPEG、cwebp 或
AVIF sidecar。需要可复现结果和文档所述 codec 兼容性时，请使用 [Node API](/zh/api/)。

## 支持的输入

- 静态 PNG、JPEG 与 WebP
- 单个队列最多 30 张图片
- 单张图片不超过 50 MB

动画图片会被明确排除，因为 Canvas 只能保留其中一帧。未来接入浏览器 codec runtime 后，
可以在不改变上传和结果操作方式的前提下扩展这一边界。
