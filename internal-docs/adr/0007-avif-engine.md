# ADR 0007：AVIF 兼容引擎与进程隔离

- 状态：Accepted
- 日期：2026-07-17
- 修订：2026-07-30（1.0 采用 L2，可选 peer）

## 决策

公开 `avif()` 以 `imagemin-avif@0.1.6` 的插件工厂、quality/lossless/speed/
chromaSubsampling shape 和默认值为兼容起点，固定 `sharp@0.35.3` 作为可选 peer
runtime。这是语义兼容，不承诺与上游动态解析到的 Sharp 0.33.5 逐字节一致。

首个 1.0 采用许可证决策单的 L2：默认安装闭包不包含 Sharp。只有可转换输入才解析
Sharp；未安装时返回稳定 `ERR_IMAGEMIN_CODEC`、`plugin:"avif"` 和精确安装命令。
导入包、使用其他插件及 AVIF 非目标输入都不解析 Sharp。恢复默认安装将重新打开
LGPL/AOM 分发审计。

Sharp 通过 `process.execPath` 启动的隔离 worker 加载。父进程只解析 Sharp module path，
不会加载其 native addon。worker 从 stdin 读取、向 stdout 写 AVIF，使用静态 source 与
JSON options 参数；用户数据不进入 eval source。worker 固定 `sharp.cache(false)`、
`sharp.concurrency(1)`、67,108,864 pixel limit 和 768 MiB V8 old-space。

options 为：quality integer 1..100（默认 90）、lossless boolean（默认 false）、
chromaSubsampling `4:2:0|4:4:4`（默认 4:2:0）、effort integer 0..9、兼容 speed
integer 0..8，以及当前唯一允许的 `bitdepth:8`。未提供 effort/speed 时保留 Sharp
默认 effort 4；显式 speed 按 `round((8-speed)*9/8)` 映射，使 0/8 对应 effort 9/0。
effort 与 speed 冲突时拒绝。Sharp 0.35 的 auto tuning 已改变，因此 worker 内部固定
`tune:ssim`，接近历史 Sharp/libheif quality 语义，但不把 tune 暴露为兼容 option。

## 原因

社区包只有约 20 行 adapter，但存在三个可复现缺陷：`speed` 不是 Sharp option 因而
完全无效；`Object.assign(defaultOptions, options)` 会跨工厂调用污染全局默认值；catch
路径调用未定义的 `callback`，把 codec error 改写成 ReferenceError。项目保留其有用
默认值，明确修复这三项行为。

Sharp 的预构建 stack 提供成熟的 PNG/JPEG/GIF/WebP/TIFF/AVIF decoder、libheif muxer
与 libaom encoder，并通过平台 optional packages 安装。直接采用 libavif-sys/aom-sys
会扩大 C/C++ 构建、链接、SIMD 和平台发布面；ravif 更容易纯 Rust 集成，但不能满足
当前 Sharp quality/chroma 兼容语义。它们可作为未来显式 native profile，不应隐藏在
同一个 `avif()` 名称下。

测试同时加载 Sharp 0.33.5 与 0.35.3 时，macOS 报告重复 Objective-C classes，并警告
可能产生不可预测崩溃。独立进程将产品 runtime、测试 oracle 和调用者已有 Sharp 版本
分开；超时、异常退出和 native crash 也被收敛到单次插件 rejection。它还避免占用
libuv worker pool。每个进程只允许一个 Sharp 线程，防止文件级并发与 AV1 encoder
内部并发相乘。

## 输入与兼容边界

静态 PNG、JPEG、GIF、WebP、TIFF 与 AVIF 可转码。SVG/未知输入 identity no-op。
APNG、animated GIF/WebP/AVIF 与 multi-page TIFF 保守 no-op，因为当前输出路径不能
保存完整 animation/pages。JPEG EXIF Orientation 在当前 Sharp 中先应用再移除；这
修复旧 stack 剥离标签后显示方向错误的问题。

默认 metadata policy 是 strip。输入上限 256 MiB，输出 512 MiB，stderr 1 MiB；单边
16,384、总计 67,108,864 pixel。PNG/JPEG/GIF/WebP/TIFF 可读尺寸在启动前检查，Sharp
对所有 decoder 再执行像素限制并以 warning 为失败阈值。已识别 metadata 单块限制
8 MiB、总计 16 MiB。Sharp soft timeout 为 180 秒，父进程在 190 秒强制杀死 worker。
尚未提供公开 AbortSignal 或 OS-level RSS hard limit。

Sharp 0.35.3 预构建 runtime 明确拒绝 10/12-bit AVIF output，所以公开类型只允许
`bitdepth:8`。HDR、高 bit depth 与完整 color-management 未经 corpus 证明前不能列为
支持。

## 结果

- 上游默认值、静态 input matrix 和 display semantics 有隔离 oracle/独立 decode 测试；
- speed bug、全局 default leak、undefined callback 均有回归证明；
- lossless 以可见 RGBA tolerance 验证，lossy 用黑/白背景合成平均误差验证；
- animation/page identity、dimension/metadata bombs、options 和 `.avif` destination 有
  契约测试；
- Phase 6 基准包含每次进程启动成本，并记录 4-job 并发 wall time 与事件循环延迟；
- v1 前仍需从 packed tarball 在八个平台分别验证默认无 Sharp 和显式安装
  `sharp@0.35.3` 两条路径，以及 AVIF smoke、许可证/SBOM/CVE 和最低版本审计。

完整证据见 [Phase 6 调研](../../docs/research/avif-codec-selection.md)。
