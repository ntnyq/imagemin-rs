# 分阶段路线图

实现顺序来自 npm 官方 downloads API 的同一滚动一年窗口，而不是主观排序。

| 阶段 | 兼容目标                       | 状态   |
| ---- | ------------------------------ | ------ |
| 0    | Core pipeline 与 Oxipng 原型   | 已完成 |
| 1    | `imagemin-svgo`                | 已完成 |
| 2    | `imagemin-gifsicle` 与 OptiPNG | 已完成 |
| 3    | `imagemin-pngquant`            | 已完成 |
| 4    | `imagemin-mozjpeg` 与 jpegtran | 已完成 |
| 5    | `imagemin-webp`                | 已完成 |
| 6    | `imagemin-avif`                | 已完成 |

每个 codec 阶段都包含 codec ADR、真实 corpus、Rust Adapter、N-API 测试、JavaScript
兼容契约、平台 smoke、benchmark 和公开兼容表。

## 当前重点：1.0 公开试用

`0.1.0-rc.9` 已在 2026 年 7 月 30 日完成发布闭环：

1. 全部 35 个 npm 包都在 `next` 下公开，并包含 integrity、signature 与 provenance；
2. immutable tag 与 GitHub Release 包含 SBOM、OpenVEX、notice、GPL 源码、构建材料和
   恢复资产；
3. 8 个原生目标都通过全新安装与全部 codec smoke；
4. 默认无 Sharp、显式 `sharp@0.35.3` 和浏览器 WASM 都通过 registry fresh install；
5. `@imagemin-rs/wasm` 已完成 bootstrap 与 trusted publisher 配置。

试用计时从 **2026-07-30 06:29 +08:00** 开始，连续 14 天在
**2026-08-13 06:29 +08:00** 结束。1.0 尚缺至少 3 份独立消费者报告，覆盖两个 OS
家族，以及默认无 Sharp、显式 Sharp 的 AVIF、浏览器或 Worker WASM 三条路径。

稳定版目标日期仍为 **2026 年 8 月 17 日**。P0/P1 修复需要发布新 RC 并重新计时；仅
缺消费者证据时延长试用，不强制发布新 RC。实时台账见
[1.0 公开试用](./public-trial.md)。

## 已锁定的 1.0 范围

维护者已选择保守分发模型：

1. Sharp 是精确版本的可选 peer，AVIF 需要 opt-in，默认安装不分发 Sharp/libvips；
2. 每个 GPL Gifsicle/pngquant 平台包携带匹配源码和构建材料，并保留 release-wide
   备份资产；
3. 浏览器包保持纯内存形式，只提供 GIF、PNG 与 SVG profile；
4. AVIF 10/12-bit、新 codec 与 OS-level 隔离不进入 1.0。

除修复 release-blocking 缺陷外，稳定版前不再增加功能。唯一内部 gate 表见
[1.0 发布计划](https://github.com/ntnyq/imagemin-rs/blob/main/internal-docs/1.0-release-plan.md)。

## 计划中的 1.x 方向

| 方向                  | 首个交付目标                                         |
| --------------------- | ---------------------------------------------------- |
| 浏览器 runtime 易用性 | First-class Worker client、批处理调度和进度/取消事件 |
| WASM 能力             | 评估更多宽松许可证 codec 与适合 streaming 的 API     |
| AVIF 与色彩           | Permissive 原生 profile、10/12-bit、HDR 与色彩契约   |
| Runtime 隔离          | 更强的强制取消和 OS-level CPU/RSS/process 控制       |
| 质量证据              | 更大的视觉/损坏输入 corpus 与更长性能历史            |
| 可重复构建            | 在上游工具链允许时比较重新构建的 sidecar binary      |

每个方向都需要独立公开契约和证据计划，不会反向阻断已锁定的 1.0。
