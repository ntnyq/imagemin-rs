# ADR 0003：GIF 与 OptiPNG 引擎边界

- 状态：Accepted
- 日期：2026-07-17

## 决策

`gifsicle()` 是 `imagemin-gifsicle@7.0.0` 的兼容入口，固定依赖
`gifsicle@5.3.0`，通过受限 child process 执行 GPL Gifsicle。该 executable
与 MIT Rust/N-API addon 保持进程边界，绝不静态或动态链接进 `.node`。
输入、stdout、stderr 和 wall time 都有硬上限。

`giflossless()` 是独立的 MIT/Apache 原生入口。它固定 `gif@0.13.3` 与
`gif-dispose@5.0.1` 以保持 Rust 1.88 MSRV，对可证明安全的动画构建 global
palette 与 delta rectangles；无法无损表达的输入原样返回。它不实现
`colors`，也不把自身称为 Gifsicle O1/O2/O3。

`optipng()` 固定 `imagemin-optipng@8.0.0` 的 option shape，但由
`oxipng@10.1.1` 执行。它总是 strip all；level 0 关闭 reductions 与 IDAT
recoding；level 7 映射到 Oxipng 6；强制 metadata/interlace/repair 的输出可以
增大。只承诺无损像素和公开 option 语义，不承诺 OptiPNG byte parity。

## 原因

Gifsicle C 为 GPL，并包含 process-global 状态与 `exit()`/`abort()` 路径，既不
适合链接进 MIT addon，也不适合从并发 worker 直接调用。纯 Rust 路线安全且
许可清晰，但 `colors` 量化和 O1/O2/O3 的精确行为不能诚实地伪装成 Gifsicle。

`gif-dispose@6` 需要 Rust 1.90。本阶段选择 5.0.1 是有意的 MSRV tradeoff；
升级到 6.x 必须与 MSRV 变更和 corpus 差分一起进行。

Oxipng 官方明确不是 OptiPNG drop-in replacement，但能提供相同的无损变换
类别。显式映射与差异表比捆绑第二个外部 executable 更适合默认 native path。

## 结果

- `gifsicle()` 安装闭包包含独立 GPL executable；发布前必须保留 GPL notice、
  对应源码和法律复核记录。
- Gifsicle 预编译产物可能按平台具有不同 patch version；兼容门禁比较语义，
  release smoke 同时记录 `--version`，不承诺跨平台字节一致。
- 原生 GIF 默认保存 comment/application metadata；`strip:true` 才删除。公开
  Gifsicle compatibility path 采用上游 `--no-app-extensions` policy。
- GIF native hard limits：256 MiB 输入、512 MiB canvas estimate、10,000 帧、
  256M composited pixels。
- OptiPNG-shaped 输出允许为了 strip/interlace/repair 增大；`oxipng()` 原生入口
  仍保留 keep-smaller policy。
- `optipng()` 检测到 `acTL` 时原样返回 APNG，避免 `strip all` 删除动画 chunks。

OptiPNG corpus 差分（2026-07-27，oracle `optipng-bin@7.0.1`）确认并固化了以下事实：

- level 0 与 OptiPNG 逐 chunk 一致（IDAT 原样、metadata 全剥离）；唯一字节级分歧是
  Oxipng 会无损截断尾部全不透明的 tRNS 条目，OptiPNG 不做该 canonicalization。
- `-strip all` 剥离集合与 OptiPNG 一致：gAMA、sRGB、cHRM、pHYs、bKGD、tIME、
  tEXt/zTXt/iTXt 与私有 ancillary chunk 两侧都不保留。
- Oxipng 会在字节更小时把 palette 展开成 truecolor（OptiPNG 只朝 palette 方向缩减）；
  表示分歧必须以更小的输出为代价，corpus 测试将其作为硬门槛。
- 默认 level 3（Oxipng preset 3）在 1 像素宽的退化几何上可比 OptiPNG 大（corpus 中
  2.5 倍的已知个例）；level 7（preset 6）消除该差距。
- CRC 损坏输入的 `errorRecovery`/`-fix` 语义一致：开启时两侧都无损修复，关闭时两侧
  都拒绝。
- OptiPNG 会把 APNG 静默压平（`-strip all` 删除 acTL/fcTL/fdAT），corpus 测试把
  pass-through 与该行为的分歧显式固化。
- `optipng-bin@7.0.1` vendored 源码为 OptiPNG 0.7.7，但 macOS 预编译产物自报
  0.7.6——与 pngquant-bin 相同类别的上游平台漂移，差分对任一 0.7.x oracle 运行。

完整证据见 [Phase 2 调研](../../docs/research/gif-optipng-codec-selection.md)。
