# 分阶段路线图

实现顺序来自 npm 官方 downloads API 的同一滚动一年窗口，而不是主观排序。

| 阶段              | 兼容目标                           | 核心验收                                         |
| ----------------- | ---------------------------------- | ------------------------------------------------ |
| Phase 0（已完成） | Core + Oxipng 原型                 | AsyncTask、API、统计、分层测试、文档/CI          |
| Phase 1（已完成） | `imagemin-svgo`                    | 固定版本、SVG corpus、渲染一致性、差异表         |
| Phase 2（已完成） | `imagemin-gifsicle` + OptiPNG 补充 | 动画/透明度/metadata、无损 PNG options           |
| Phase 3（已完成） | `imagemin-pngquant`                | 质量区间、色差、透明边缘、sidecar 版本审计       |
| Phase 4（已完成） | `imagemin-mozjpeg` + jpegtran      | progressive、质量、高级 options、EXIF/ICC        |
| Phase 5（已完成） | `imagemin-webp`                    | 格式转换、透明度、扩展名、lossless/near-lossless |
| Phase 6（已完成） | `imagemin-avif`                    | 8-bit/chroma、隔离进程、长任务并发与资源上限     |

每个 codec 阶段都必须完成 codec ADR、真实 corpus、Rust Adapter、N-API 测试、JS 兼容契约、平台 smoke、benchmark 和公开兼容表。

## 当前：发布加固

兼容阶段完成后，发布加固按以下顺序推进：

1. 完成 cwebp 自建 sidecar 的源码校验、多平台构建、npm 分发与真实 smoke；
2. 扩展 mozjpeg/jpegtran、pngquant、gifsicle，并按许可证拆分平台包；
3. 将全部 sidecar 接入 verify、pack、smoke、publish 与 provenance；
4. 完成 8 平台 RC 演练，再评估首个公开版本。

详细分发决策见 [ADR 0009](https://github.com/ntnyq/imagemin-rs/blob/main/internal-docs/adr/0009-sidecar-distribution.md)。

详细任务和门槛见 [实现计划](https://github.com/ntnyq/imagemin-rs/blob/main/internal-docs/implementation-plan.md)。
