# imagemin-rs 产品完成度审计

更新日期：2026-07-27

本文件把“代码能运行”与“可替代 imagemin、可发布”分开。状态只依据当前仓库中可以复现的代码、测试、构建和发布产物，不依据计划或意图。

## 状态定义

- `已证明`：存在覆盖该要求范围的实现和自动化验证。
- `部分`：主路径存在，但兼容面、平台或失败模式尚未覆盖。
- `缺失`：没有足够实现或证据。

## 兼容 Interface

| 要求                              | 状态   | 当前证据 / 缺口                                                                                                                                                                                                                                                                                                         |
| --------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `imagemin(inputs, options)`       | 已证明 | glob、literal path、junk 过滤、destination、稳定顺序、格式变化扩展名和 1..32 并发上限之外，已有对 `imagemin@9` 的文件 corpus 差分：glob 语义/集合一致（含 Windows 反斜杠转换与确定性排序）、literal 顺序与重复、destination 展平与嵌套创建、`.webp` 改名一致、非 WebP 按 magic 改名的有意分歧、插件调用次数与错误传播。 |
| `imagemin.buffer(input, options)` | 已证明 | 无插件复制、同步/异步函数插件、非法返回值、顺序和错误传播已有测试。                                                                                                                                                                                                                                                     |
| 第三方 imagemin 函数插件          | 部分   | Buffer/Uint8Array、同步/异步和官方 jpegtran 无 Adapter 互操作已覆盖；仍需扩大官方插件矩阵。                                                                                                                                                                                                                             |
| 原生插件顺序和融合                | 已证明 | 连续 native descriptor 融合，且不能跨 JS seam；Rust、binding 和公开包均有契约测试。                                                                                                                                                                                                                                     |
| 稳定错误模型                      | 部分   | 取消、plugin/codec 和逐文件 `sourcePath` 已有稳定错误码；仍缺平台 binding 缺失 tarball 与全部失败模式的实机矩阵。                                                                                                                                                                                                       |
| 并发与取消                        | 部分   | 文件队列有默认 4/上限 32 和 AbortSignal；sidecar 可强制终止，native/不协作 JS 只能立即拒绝而不能抢占底层 CPU。                                                                                                                                                                                                          |

## Codec 兼容

| 上游目标               | 状态   | 发布门槛                                                                                                                                    |
| ---------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `imagemin-svgo@12`     | 已证明 | 固定 SVGO 4.0.2、全 option passthrough、差分矩阵、真实设计工具 corpus 与渲染门禁。                                                          |
| `imagemin-gifsicle@7`  | 部分   | sidecar 支持全部 options；动画 canonicalization、loop/delay/interlace/metadata 已测。仍需发布平台 executable fingerprint 与 GPL 法律复核。  |
| `imagemin-optipng@8`   | 部分   | option shape、strip all、level 0、repair、output growth 与 APNG pass-through 已测；仍缺 OptiPNG 0.7.7 大 corpus 差分。                      |
| `imagemin-pngquant@10` | 部分   | 全 options、逐字节差分、quality floor、alpha/背景合成误差与 APNG no-op 已测；仍需统一各平台 pngquant 3.0.3 sidecar 和 GPL 法律复核。        |
| `imagemin-mozjpeg@10`  | 部分   | 全 options、逐字节差分、progressive、灰度、metadata 与独立解码误差已测；仍需统一、自建并 fingerprint 各平台 MozJPEG sidecar。               |
| `imagemin-jpegtran@8`  | 部分   | progressive/arithmetic 逐字节差分、像素无损和 metadata strip 已测；仍需统一平台 binary、provenance 与真实安装 smoke。                       |
| `imagemin-webp@8`      | 部分   | 全 options、PNG/JPEG/TIFF/WebP、alpha/metadata、动画 no-op 与扩展名已测；仍需安全修补的自建多平台 cwebp、provenance 和安装 smoke。          |
| `imagemin-avif@0.1`    | 部分   | 固定 Sharp 0.35.3、完整 options、alpha/chroma、动画 no-op、隔离进程与资源限制已测；仍需平台 tarball smoke、10/12-bit 决策和 CVE/SBOM 审计。 |

## 质量与安全

| 要求                       | 状态 | 缺口                                                                                                                                                                                                                                                                                                                    |
| -------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 分层自动化测试             | 部分 | 已有 Rust、真实 `.node`、公开包、类型和 package manifest 测试；codec corpus 尚小。                                                                                                                                                                                                                                      |
| 渲染/解码等价验证          | 部分 | SVG/GIF/PNG/JPEG/WebP/AVIF 均有渲染、逐帧或独立 decoder 门禁；corpus 仍需扩展。                                                                                                                                                                                                                                         |
| 损坏与恶意输入             | 部分 | 所有当前 codec 都有尺寸/结构/帧/metadata 或进程限制，原生 PNG/GIF/SVG pipeline 另有 fuzz 覆盖；仍缺 OS-level RSS sandbox。                                                                                                                                                                                              |
| fuzz / corpus 回归         | 部分 | PNG/GIF/SVG 原生 pipeline 已有 `cargo-fuzz` target、hex fixture seed、CI 30s/每周 10min 长跑；4 个已修复 finding（含 vendored svgm-core 补丁）见 `fuzzing.md` findings log，均有回归测试。sidecar codec 面（gifsicle/pngquant/mozjpeg/cwebp/sharp 进程输入）不在 in-process fuzz 范围内，依赖各自的进程隔离与资源上限。 |
| 性能与内存基线             | 部分 | Phase 1..6 有 median/p95/size artifacts，AVIF 含并发/事件循环；仍缺跨平台峰值 RSS hard gate。                                                                                                                                                                                                                           |
| 输出确定性与 metadata 政策 | 部分 | SVG/GIF/PNG/JPEG/WebP/AVIF 已固定；跨平台 encoder byte parity 只对统一 artifact 承诺。                                                                                                                                                                                                                                  |

## 发布与运维

| 要求                          | 状态   | 缺口                                                                                                                     |
| ----------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------ |
| ESM 包、声明和 exports        | 已证明 | `tsdown` 构建与 `pnpm pack --dry-run` 已验证。                                                                           |
| root + 平台 optional packages | 部分   | 8 个平台包、精确 optional dependency 重写、文件白名单与当前 macOS ARM64 tarball 已验证；尚缺 8 平台真实 artifact。       |
| 多平台二进制 CI               | 部分   | release workflow 已定义 8 target 构建、artifact 汇总及 GNU/musl/双架构 smoke；尚未在 release tag 上取得实跑证据。        |
| 可重复 release                | 部分   | 已有版本一致性、SHA-512、tarball 安装 smoke、OIDC staged publish 和恢复手册；首次 bootstrap 与真实 provenance 尚未执行。 |
| 文档站                        | 部分   | VitePress 构建和 Pages workflow 已有；需随每个 codec 增加兼容表、迁移指南和发布安装说明。                                |

## 完成判定

只有当以上所有产品要求达到 `已证明`，且支持平台上的真实安装、加载和每个 codec smoke test 均从发布 tarball 运行通过，才可把长期目标标记为完成。
