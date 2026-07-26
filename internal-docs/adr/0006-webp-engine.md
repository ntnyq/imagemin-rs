# ADR 0006：WebP 兼容引擎与转码边界

- 状态：Accepted
- 日期：2026-07-17

## 决策

`webp()` 固定 `imagemin-webp@8.0.0` 的公开 option shape，并通过受限 child process
执行 `cwebp-bin@8.0.0` 的 cwebp sidecar。当前开发 artifact 报告 libwebp 1.2.1；
macOS 文件实际为 x86_64 Mach-O，在 Apple Silicon 上依赖 Rosetta。它仅作为开发
compatibility oracle，v1 发布必须从固定 libwebp source revision 自建原生平台包。

支持 preset、quality、alphaQuality、method、size、sns、filter、autoFilter、
sharpness、lossless、nearLossless、crop、resize 与 metadata。默认及非零 option
matrix 与 `imagemin-webp@8.0.0` 逐字节一致。项目有意修复上游的 JavaScript truthy
判断：`quality:0`、`method:0`、`alphaQuality:0`、`sns:0`、`filter:0`、
`sharpness:0`、`lossless:0` 与 `nearLossless:0` 会传给 cwebp，而不是静默退回默认值。

cwebp 可以读取 PNG、JPEG、TIFF 与静态 WebP。GIF 与其他输入保持 identity no-op。
APNG、animated WebP 与 multi-page TIFF 也保守 no-op；兼容上游只处理首帧/首页或
失败的行为会造成内容丢失，不适合作为安全的优化默认值。

crop/resize 属于上游兼容面，不进入 Rust core 的通用图像变换抽象。它们严格按 cwebp
顺序执行（先 crop，后 resize），并在调用前验证整数、范围与输出像素预算。

## 原因

固定 cwebp executable 是最小且最精确的兼容 Seam：同一 libwebp build 下，可直接与
上游临时文件 adapter 做 byte differential。本项目使用 stdin/stdout（`-o - -- -`），
已证明与临时文件输出相同，避免磁盘竞态和清理失败。

直接链接 libwebp-sys 可以消除进程启动开销，但会把 C ABI、安全公告、SIMD、构建
脚本和平台链接风险引入 native addon，且不自动获得 imagemin-webp CLI 参数的精确
行为。待平台发布链成熟后，可以增加显式 native profile；不能把不同 encoder build
隐藏在 `webp()` 兼容名下。

`cwebp-bin@8.0.0` 的 source archive 是 libwebp 1.2.1，并包含 BSD-3-Clause `COPYING`
与 `PATENTS` grant。npm wrapper 本身是 MIT。开发安装已观察到 install-time binary
下载在代理环境中无超时挂起，因此最终包不得依赖安装时网络下载或本机编译 fallback。

## 结果

- 输入、stdout、stderr、wall time 上限分别为 256 MiB、512 MiB、1 MiB、120 秒；
  PNG/JPEG/TIFF/WebP dimensions 与 crop/resize 受 512 MiB 像素预算限制。
- options 在工厂调用时同步验证；未知字段、嵌套未知字段、重复/冲突 metadata 和越界
  值被拒绝。
- lossless WebP 保持所有非全透明像素 RGBA 与 alpha；libwebp 可规范化 alpha=0
  像素不可见的隐藏 RGB，因此 conformance 不能要求这些无显示意义的字节相同。
- lossy RGBA 在黑/白背景合成后测平均误差，避免透明像素的隐藏 RGB 扭曲指标。
- metadata `none` 默认不输出扩展 chunks；`icc`/`exif` 通过 RIFF `ICCP`/`EXIF`
  chunk 验证。XMP 仍由同一参数路径支持。
- 文件 API 根据最终 magic 更新 destination extension；PNG/JPEG/TIFF 转 WebP 会写入
  `.webp`，原格式未变化时保留源扩展名。
- 当前 darwin arm64 oracle SHA-256 为
  `67f3ea3a6e26072adc2fe032e288aa8c8ce2d2ed2c15f0e17feb4e468038ecc5`，不能冒充
  native arm64 artifact。

完整证据见 [Phase 5 调研](../../docs/research/webp-codec-selection.md)。
