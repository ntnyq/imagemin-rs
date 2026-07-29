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

## 当前重点：完整公开 RC

已经完成的发布工作包括：

1. cwebp、MozJPEG、pngquant 与 Gifsicle sidecar 的可复现源码校验和多平台构建；
2. 全部原生及 sidecar 平台包接入 verify、pack、smoke、publish 与 provenance；
3. release bundle、Rust 包、生产 npm 依赖和内嵌原生库的确定性 CycloneDX 清单；
4. 阻断发布的 RustSec、Cargo policy 和生产 npm 高危依赖审计；
5. release tag 已通过完整跨平台打包与真实 codec smoke 矩阵。

维护者已为 1.0 选择保守分发模型：

1. Sharp 是精确版本的可选 peer，AVIF 需要 opt-in，默认安装不分发 Sharp/libvips；
2. 每个 GPL Gifsicle/pngquant 平台包都携带匹配源码和构建材料，同时保留 release-wide
   备份资产；
3. AVIF 10/12-bit 不进入首个稳定版范围。

下一个 RC 必须把这套模型证明为一个完整公开单元：35 个同版本 npm 包、8 平台安装与
codec smoke、默认无 Sharp 和显式 Sharp 两条路径、provenance/SBOM/notice，以及匹配
GitHub 资产。它也会完成 `@imagemin-rs/wasm` 的一次性公开 bootstrap。

## 1.0 日期与门禁

稳定版目标日期是 **2026 年 8 月 17 日**。计划中的 `0.1.0-rc.8` 必须连续公开 14 天，
且没有未关闭的 release-blocking 缺陷。阻断问题修复后必须发布新 RC，并重新计时。
若完整 RC 延迟或试用证据不足，1.0 顺延；日期不能覆盖门禁。

参与方式与阻断标准见 [1.0 公开试用](./public-trial.md)。唯一内部 gate 表见
[1.0 发布计划](https://github.com/ntnyq/imagemin-rs/blob/main/internal-docs/1.0-release-plan.md)。

## 1.0 之后

更大的视觉/损坏输入 corpus、更长性能历史、更多 WASM codec、AVIF 10/12-bit/HDR、
OS-level 资源隔离和 permissive 原生 AVIF profile 属于 1.x，不阻断已经锁定的 1.0
契约。
