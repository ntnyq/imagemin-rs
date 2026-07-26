# ADR 0005：MozJPEG 与 jpegtran 兼容引擎

- 状态：Accepted
- 日期：2026-07-17

## 决策

`mozjpeg()` 固定 `imagemin-mozjpeg@10.0.0` 的公开 option shape，并执行
`mozjpeg@8.0.0` 提供的独立 `cjpeg` sidecar。`jpegtran()` 固定
`imagemin-jpegtran@8.0.0`，执行 `jpegtran-bin@7.0.0` 的独立 sidecar。两条路径
都通过共享的受限 child-process runner 运行，不把 C codec 链接进 napi-rs addon。

当前 macOS arm64 开发基线分别报告 MozJPEG 3.2（build 20180508）和
libjpeg-turbo 1.5.1（build 20161213）。这是兼容 oracle，不是最终跨平台发布
artifact。v1 发布必须自行构建、固定来源和工具链，并验证每个平台 sidecar 的版本
与 SHA-256；安装时回退到本机编译不属于可重复发布路径。

`mozjpeg()` 支持 quality、progressive、targa、revert、fastCrush、dcScanOpt、
trellis、trellisDC、tune、overshoot、arithmetic、dct、quantBaseline、quantTable、
smooth、maxMemory 与 sample。默认 trellis、trellisDC 和 overshoot 为 true，与上游
参数构造一致。`quantBaseline` 修复上游把布尔值 `true` 当文件名传入的 bug：本项目
只发送 `-quant-baseline` flag。

`jpegtran()` 支持 progressive 与 arithmetic，并保留上游固定的 `-copy none`。
因此变换在 DCT coefficients 上无损，但会删除 EXIF orientation、ICC profile 和
comment。这里的“无损”只指图像系数；删除 orientation 或 ICC 可能改变应用程序显示
出来的方向或颜色。该入口优先兼容，文档和测试必须显式暴露这一边界。

## 原因

sidecar 能精确复现既有 imagemin 插件的命令行语义，并把不可信 JPEG 触发的 C
codec 失败隔离在子进程。直接使用 Rust `mozjpeg` FFI 会增加 native addon 的
unsafe、panic containment、NASM/SIMD 和交叉编译矩阵，同时仍不能保证与上游已发布
binary 逐字节一致。两个 codec 的上游许可允许再分发，但实际 artifact 仍包含 IJG、
BSD-3-Clause 与 zlib 等 notice obligations，不能只引用 npm wrapper 的 MIT 许可。

stdin/stdout 取代上游 jpegtran adapter 的临时文件。固定 fixture 证明同一 executable
和参数的输出逐字节相同，同时减少磁盘 I/O、临时文件清理与竞态面。

## 结果

- 两条路径限制为 256 MiB 输入、512 MiB stdout、1 MiB stderr、120 秒 wall time，
  启动前拒绝超过 512 MiB RGBA 解码预算的 dimensions。
- 非 JPEG 返回原输入 identity；带 JPEG signature 的损坏输入返回
  `ERR_IMAGEMIN_CODEC`。
- options 在工厂调用时同步验证，未知字段和越界值被拒绝；这比上游静默透传未知
  字段更严格。
- MozJPEG 默认生成 progressive JPEG，保留 fixture 的 EXIF、ICC 与 comment；
  视觉 conformance 使用独立纯 JavaScript decoder 校验尺寸与 RGB 误差。
- jpegtran 的 baseline/progressive/arithmetic matrix 与上游逐字节一致，并通过独立
  解码证明颜色和灰度 fixture 像素完全相等。
- `targa` 继承上游形状，但插件先做 JPEG signature guard，因此不是通用 TGA 输入
  转换入口。
- 多架构统一 sidecar、自建 provenance、许可证清单与安装 smoke 仍属于最终发布 gate。

完整证据见 [Phase 4 调研](../../docs/research/jpeg-codec-selection.md)。
