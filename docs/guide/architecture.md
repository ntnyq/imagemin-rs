# 项目架构

## 跨语言三层与 Rust 内部分层

```text
packages/imagemin
  imagemin 兼容 Interface、文件 I/O、JS 插件、错误上下文
          │ 私有 NativePluginDescriptor
          ▼
napi/imagemin
  Buffer 转换、AsyncTask 调度、Rust 错误映射
          │ Vec<u8> + typed options
          ▼
crates/imagemin (facade)
  descriptor registry 与稳定 re-export
          │
          ├─ imagemin-core：asset、格式、错误、开放 plugin trait、pipeline/统计
          ├─ imagemin-codec-png：Oxipng 与 OptiPNG-compatible path
          ├─ imagemin-codec-gif：GIF analysis、encode、metadata 与资源策略
          └─ imagemin-codec-svg：XML policy 与 SVGM
```

Rust Module 不知道 glob、路径和 Node.js。JS Module 不知道 codec FFI 和线程细节。N-API Adapter 保持薄，只负责语言 seam。

## 为什么使用 AsyncTask

图片压缩是 CPU 密集任务。JavaScript `async` 只能改变返回形式，不能防止同步 native 函数阻塞事件循环。原生插件因此在 `AsyncTask::compute` 中执行，并在 `resolve` 阶段创建 JavaScript 结果。

## 插件融合

原生插件工厂返回普通函数，因此和 imagemin 插件兼容。内部 `WeakMap` 保存 descriptor：

```text
[native A, native B, JS C, native D]
        │                    │
        └─ AsyncTask #1      └─ AsyncTask #2
                  JS C 在中间严格执行
```

无法识别 descriptor 时只损失融合性能，不影响正确性。

完整 SVGO 配置允许 JavaScript 函数，不能序列化成 descriptor，因此 `svgo()` 保持 JS 兼容 seam；边界清楚的 `svgm()` 才进入原生融合。这个区别防止为了 fast-path 静默改变 plugin 顺序或丢弃参数。

## crate 粒度

Phase 0 先用单一 Rust crate 验证 seam；在 codec 依赖和测试边界稳定后，workspace 已拆为薄
facade、无 codec 依赖的 `imagemin-core`，以及按 PNG/GIF/SVG 聚合的 codec crates。粒度按依赖、
许可证、资源策略和构建边界决定，而不是机械地为每个函数建 crate。PNG 的两个入口共享同一
engine，所以仍在一个深 crate；GIF crate 内再按 analysis/encode/metadata 拆 Module。

完整决策见仓库内的 [ADR 0001](https://github.com/ntnyq/imagemin-rs/blob/main/internal-docs/adr/0001-architecture.md)
与 [ADR 0008](https://github.com/ntnyq/imagemin-rs/blob/main/internal-docs/adr/0008-rust-crate-boundaries.md)。
