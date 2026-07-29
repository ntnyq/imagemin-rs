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

## 当前重点：稳定版加固

已经完成的发布工作包括：

1. cwebp、MozJPEG、pngquant 与 Gifsicle sidecar 的可复现源码校验和多平台构建；
2. 全部原生及 sidecar 平台包接入 verify、pack、smoke、publish 与 provenance；
3. release bundle、Rust 包、生产 npm 依赖和内嵌原生库的确定性 CycloneDX 清单；
4. 阻断发布的 RustSec、Cargo policy 和生产 npm 高危依赖审计；
5. release tag 已通过完整跨平台打包与真实 codec smoke 矩阵。

稳定版剩余工作已经从“补平台构建”转为“关闭证据缺口”：

1. 完成维护者与律师对 GPL、LGPL 和 AOM 专利文本交付模型的复核；tagged release
   已准备附加经校验的 GPL 源码输入；
2. 通过 OpenVEX、显式构建配置、AOM 源码历史断言和 8 平台 smoke 持续复现已经
   完成的原生依赖审计；
3. AVIF 10/12-bit 在具备可测试兼容契约前不进入首个稳定版范围。

随后继续扩大 corpus 与性能基线，并验证可替换当前 Canvas 预览引擎的浏览器原生
codec runtime。

详细分发决策见 [ADR 0009](https://github.com/ntnyq/imagemin-rs/blob/main/internal-docs/adr/0009-sidecar-distribution.md)，
具体门槛见[实现计划](https://github.com/ntnyq/imagemin-rs/blob/main/internal-docs/implementation-plan.md)。
