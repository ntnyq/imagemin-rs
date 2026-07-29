---
title: Image Playground
description: Resize and optimize local images directly in your browser.
pageClass: image-playground-page
aside: false
outline: false
---

# Image Playground

Drop a group of local images, adjust the output format, quality, and dimensions,
then compare byte sizes and download individual results or one ZIP archive.

<ClientOnly>
  <ImagePlayground locale="en" />
</ClientOnly>

## How it works

The Playground uses your browser's image decoder, Canvas renderer, and encoder.
`useFileDialog` and `useDropZone` from VueUse handle local file selection, while
`useObjectUrl` manages previews without uploading files. Processing is local and
strips source metadata as part of Canvas re-encoding.

This browser engine is a convenient preview tool, not the Node.js
`imagemin-rs` runtime. Its output can vary by browser and it does not expose
the pinned SVGO, Gifsicle, Oxipng, pngquant, MozJPEG, cwebp, or AVIF sidecars.
Use the [Node API](/api/) when reproducibility and documented codec
compatibility are required.

## Supported input

- Static PNG, JPEG, and WebP files
- Up to 30 files in one queue
- Up to 50 MB per file

Animated images are intentionally excluded because Canvas would preserve only
one frame. A future browser codec runtime can expand this boundary without
changing the upload and result workflow.
