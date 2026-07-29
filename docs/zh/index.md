---
layout: home

hero:
  name: imagemin-rs
  text: imagemin 兼容，Rust 原生执行
  tagline: 使用 napi-rs AsyncTask 构建可组合、可观测、跨平台的图片优化管线。
  actions:
    - theme: brand
      text: 快速开始
      link: /zh/guide/getting-started
    - theme: alt
      text: 打开 Playground
      link: /zh/playground

features:
  - title: 熟悉的 Interface
    details: 保留 imagemin()、imagemin.buffer() 与函数型插件，同时增加带统计的 optimize()。
  - title: CPU-safe Native
    details: 图片 codec 在 napi-rs AsyncTask worker 中执行，不用 JavaScript async 包装同步阻塞。
  - title: 浏览器 WASM
    details: 独立纯内存包可在浏览器与 Web Worker 中运行共享 GIF、PNG 与 SVG Rust codec。
  - title: 分阶段兼容
    details: 以 npm 官方下载量排序实现插件，每个阶段用真实 corpus 和兼容表验收。
---
