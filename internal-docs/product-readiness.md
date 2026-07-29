# imagemin-rs 产品完成度审计

更新日期：2026-07-30

本文件把“代码能运行”与“可替代 imagemin、可发布”分开。状态只依据当前仓库中可以复现的代码、测试、构建和发布产物，不依据计划或意图。

本文件是长期产品能力台账，**不是 1.0 gate 清单**。首个稳定版是否可发布只由
[`1.0-release-plan.md`](./1.0-release-plan.md) 的 G0–G5 判定；下表中的“部分”只有在
该要求被明确映射到 G0–G5 时才阻断 1.0。取消抢占、扩大 corpus、OS-level RSS
sandbox、跨平台 byte parity 等已明确进入 1.x 路线图，不得因本表仍为“部分”而
重新提升为 1.0 硬门槛。

## 状态定义

- `已证明`：存在覆盖该要求范围的实现和自动化验证。
- `部分`：主路径存在，但兼容面、平台或失败模式尚未覆盖。
- `缺失`：没有足够实现或证据。

## 发布证据基线

`v0.1.0-rc.9` 的
[Release workflow](https://github.com/ntnyq/imagemin-rs/actions/runs/30487591906)
已在 8 个目标上完成 binding、cwebp、MozJPEG、pngquant 和 Gifsicle 构建，从完整
35 包 bundle 执行 WASM 浏览器 smoke 与逐平台 11 codec 真实 smoke，并生成
[GitHub Release](https://github.com/ntnyq/imagemin-rs/releases/tag/v0.1.0-rc.9)、
SBOM、OpenVEX、GPL source assets 和逐包摘要。所有构建、依赖审计、bundle 与 smoke
job 均成功。

随后同一 tag 的
[OIDC publish workflow](https://github.com/ntnyq/imagemin-rs/actions/runs/30494894639)
发布了全部 35 包。registry 回读确认每包 `next`、integrity、npm signature 和 SLSA
attestation；fresh install 又验证默认无 Sharp、显式 Sharp 的 11 codec 以及公开
WASM 包的 Chromium 路径。G1/G3 已关闭，公开试用从
2026-07-30 06:29 +08:00 开始。

## 兼容 Interface

| 要求                              | 状态   | 当前证据 / 缺口                                                                                                                                                                                                                                                                                                                |
| --------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `imagemin(inputs, options)`       | 已证明 | glob、literal path、junk 过滤、destination、稳定顺序、格式变化扩展名和 1..32 并发上限之外，已有对 `imagemin@9` 的文件 corpus 差分：glob 语义/集合一致（含 Windows 反斜杠转换与确定性排序）、literal 顺序与重复、destination 展平与嵌套创建、`.webp` 改名一致、非 WebP 按 magic 改名的有意分歧、插件调用次数与错误传播。        |
| `imagemin.buffer(input, options)` | 已证明 | 无插件复制、同步/异步函数插件、非法返回值、顺序和错误传播已有测试。                                                                                                                                                                                                                                                            |
| 第三方 imagemin 函数插件          | 已证明 | 函数插件与上游一致地收到 Node Buffer（修复了 optipng/mozjpeg/gifsicle/webp/svgo 的 `Buffer.isBuffer` 守卫在本管线内直接抛错的缺口）；八个官方插件族在本管线与上游 `imagemin@9` 管线内逐字节一致，另有非匹配格式 pass-through、原生融合被 JS seam 打断、`ERR_IMAGEMIN_PLUGIN` 错误传播与官方 WebP 插件的文件 destination 差分。 |
| 原生插件顺序和融合                | 已证明 | 连续 native descriptor 融合，且不能跨 JS seam；Rust、binding 和公开包均有契约测试。                                                                                                                                                                                                                                            |
| 稳定错误模型                      | 部分   | 取消、plugin/codec 和逐文件 `sourcePath` 已有稳定错误码；仍缺平台 binding 缺失 tarball 与全部失败模式的实机矩阵。                                                                                                                                                                                                              |
| 并发与取消                        | 部分   | 文件队列有默认 4/上限 32 和 AbortSignal；sidecar 可强制终止，native/不协作 JS 只能立即拒绝而不能抢占底层 CPU。                                                                                                                                                                                                                 |

## Codec 兼容

| 上游目标               | 状态   | 发布门槛                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `imagemin-svgo@12`     | 已证明 | 固定 SVGO 4.0.2、全 option passthrough、差分矩阵、真实设计工具 corpus 与渲染门禁。                                                                                                                                                                                                                                                                                                                                                                             |
| `imagemin-gifsicle@7`  | 已证明 | 全 options、动画 canonicalization、loop/delay/interlace/metadata 已测；自建 Gifsicle 1.96 已有固定源码摘要、8 目标 tarball smoke，以及维护者选择的 GPLv2 §3(a) 随包源码/构建材料交付模型。npm 公开回读由 G1 统一跟踪，不再属于 codec 兼容缺口。                                                                                                                                                                                                                |
| `imagemin-optipng@8`   | 已证明 | 除 option shape、strip all、level 0、repair、output growth 与 APNG pass-through 外，已有覆盖全部 color type、位深 1..16、tRNS 三种表示、Adam7 与 metadata 的 corpus 差分：像素经独立 decoder 逐一无损、strip 策略一致、level 0 逐 chunk 一致（唯一分歧为 Oxipng 截断尾部不透明 tRNS）、interlace/reductions/errorRecovery 语义一致、level 7 尺寸不劣于 OptiPNG。oracle 为 `optipng-bin@7.0.1`（vendored 0.7.7 源码，macOS 预编译自报 0.7.6，属上游平台漂移）。 |
| `imagemin-pngquant@10` | 已证明 | 全 options、quality floor、alpha/背景合成误差与 APNG no-op 已测；自建 pngquant 3.0.3/libimagequant 已有固定源码摘要、Cargo lock、全部 45 个 registry source 归档、8 目标 tarball smoke，以及维护者选择的 GPLv3 随包 Corresponding Source 模型。npm 公开回读由 G1 统一跟踪。                                                                                                                                                                                    |
| `imagemin-mozjpeg@10`  | 已证明 | 全 options、progressive、灰度、metadata 与独立解码误差已测；自建 MozJPEG 4.1.1 已有固定源码摘要、provenance 和 8 目标真实安装及 codec smoke。                                                                                                                                                                                                                                                                                                                  |
| `imagemin-jpegtran@8`  | 已证明 | progressive/arithmetic、像素无损和 metadata strip 已测；与 cjpeg 同次构建的 MozJPEG 4.1.1 jpegtran 已接入 provenance，并通过 8 目标真实安装及 codec smoke。                                                                                                                                                                                                                                                                                                    |
| `imagemin-webp@8`      | 已证明 | 全 options、PNG/JPEG/TIFF/WebP、alpha/metadata、动画 no-op 与扩展名已测；自建 cwebp/libwebp 1.6.0 已有固定源码摘要、provenance 和 8 目标真实安装及 codec smoke。                                                                                                                                                                                                                                                                                               |
| `imagemin-avif@0.1`    | 已证明 | 首个稳定版采用 L2：精确 optional peer `sharp@0.35.3` 不进入默认闭包；无 Sharp 时返回稳定、可操作错误，显式安装后完整 options、alpha/chroma、动画 no-op、隔离进程与资源限制在 8 目标 tarball smoke 通过。根包携带 LGPL/AOM notice、许可与专利文本的固定摘要验证。10/12-bit 明确排除在 1.0 范围。                                                                                                                                                                |

## 质量与安全

| 要求                       | 状态 | 缺口                                                                                                                                                                                                             |
| -------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 分层自动化测试             | 部分 | 已有 Rust、真实 `.node`、公开包、类型和 package manifest 测试；扩大 codec corpus 是 1.x 持续工作，不是 1.0 gate。                                                                                                |
| 渲染/解码等价验证          | 部分 | SVG/GIF/PNG/JPEG/WebP/AVIF 均有渲染、逐帧或独立 decoder 门禁；扩大 corpus 是 1.x 持续工作，不是 1.0 gate。                                                                                                       |
| 损坏与恶意输入             | 部分 | 所有当前 codec 都有尺寸/结构/帧/metadata 或进程限制，原生 PNG/GIF/SVG pipeline 另有 fuzz 覆盖；OS-level RSS sandbox 明确进入 1.x。发布日前发现的实际安全缺陷仍按 G4/G5 阻断。                                    |
| fuzz / corpus 回归         | 部分 | PNG/GIF/SVG 原生 pipeline 已有 `cargo-fuzz` target、hex fixture seed、CI 30s/每周 10min 长跑；5 个已修复 finding 均有回归测试。sidecar codec 面依赖进程隔离与资源上限；扩大 in-process/sidecar fuzz 面进入 1.x。 |
| 性能与内存基线             | 部分 | Phase 1..6 有 median/p95/size artifacts，AVIF 含并发/事件循环；跨平台峰值 RSS hard gate 明确进入 1.x。                                                                                                           |
| 输出确定性与 metadata 政策 | 部分 | SVG/GIF/PNG/JPEG/WebP/AVIF 已固定；只对同一发布 artifact 承诺字节一致，跨平台 encoder byte parity 不属于 1.0 契约。                                                                                              |

## 发布与运维

| 要求                          | 状态   | 缺口                                                                                                                                                                                                                         |
| ----------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ESM 包、声明和 exports        | 已证明 | `tsdown` 构建与 `pnpm pack --dry-run` 已验证。                                                                                                                                                                               |
| root + 平台 optional packages | 已证明 | 8 个 binding、8 个 BSD sidecar、8 个 GPL pngquant、8 个 GPL Gifsicle、WASM、binding loader 与 root 包均有精确依赖、文件白名单与版本门禁；完整 35 包 `rc.9` 已公开并通过 WASM、8 平台 codec smoke 与 registry fresh install。 |
| 多平台二进制 CI               | 已证明 | `v0.1.0-rc.9` release tag 已完成 8 target binding/cwebp/MozJPEG/pngquant/Gifsicle 构建、artifact 汇总，以及 GNU/musl、x64/arm64 的 8 平台 smoke；WASM 浏览器 smoke 同时通过。                                                |
| 可重复 release                | 已证明 | `rc.9` 已证明版本一致性、SHA-512、35 包 bundle/OIDC publish、确定性 CycloneDX 清单、8 平台/WASM smoke、GPL 随包源码、Release 备份与恢复材料、provenance/registry 回读和 fresh install。                                      |
| 文档站                        | 已证明 | VitePress 构建和 Pages workflow 已有；中英文 codec 兼容说明、迁移指南、RC 安装说明和 native/sidecar 排错页均已纳入站点。                                                                                                     |

## 完成判定

“长期产品完成度”只有当以上所有能力达到 `已证明` 时才完成；这是 1.x 持续改进目标，
不等同于“首个稳定版可发布”。

1.0 的完成判定只使用 [`1.0-release-plan.md`](./1.0-release-plan.md)：

1. G0 分发模型选择与制品契约；
2. G1 同版本 35 包发布单元；
3. G2 八平台安装及默认无 Sharp/显式 Sharp 两条路径；
4. G3 WASM bootstrap 与 trusted publisher；
5. G4 14 天公开试用及最低真实消费者证据；
6. G5 最终安全、完整性、文档、版本和发布负责人批准。

本表中的错误覆盖扩展、底层 CPU 抢占式取消、更大 corpus、OS-level RSS sandbox、
跨平台 byte parity 与更多 WASM codec 均为 1.x 路线图项。除非出现一个具体 P0/P1，
或维护者显式修改 canonical gate 表，它们不阻断 1.0。
