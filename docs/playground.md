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

The Playground runs `@imagemin-rs/wasm` inside a Web Worker. PNG files that do
not need resizing are passed directly to the shared Rust Oxipng codec, avoiding
a browser decode/re-encode round trip. Resized PNG files are rendered through
Canvas first and then optimized by WASM. JPEG and WebP output continues to use
the browser's Canvas encoder.

`useFileDialog` and `useDropZone` from VueUse handle local file selection, while
`useObjectUrl` manages previews without uploading files. Result cards identify
the engine used for each output.

The WASM package shares Rust codec behavior with the Node.js runtime, but it
does not expose N-API, file APIs, or executable sidecars. Canvas output can
still vary by browser. Use the [Node API](/api/) when you need the full codec
set or file pipeline, and the [Browser WASM API](/api/wasm) for the browser
runtime contract.

## Supported input

- Static PNG, JPEG, and WebP files
- Up to 30 files in one queue
- Up to 50 MB per file

Animated images are intentionally excluded because Canvas would preserve only
one frame when resizing or converting. The underlying WASM package supports
frame-preserving `giflossless()` for applications that process GIF bytes
directly.
