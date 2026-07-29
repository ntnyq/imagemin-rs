# imagemin-rs 分阶段实现计划

## 排序依据

插件顺序使用 npm 官方 downloads API 的同一滚动一年窗口（2025-07-16 至 2026-07-15）。指定插件排序为：

1. `imagemin-svgo`
2. `imagemin-gifsicle`
3. `imagemin-pngquant`
4. `imagemin-mozjpeg`
5. `imagemin-webp`
6. `imagemin-avif`

经典无损插件纳入后，`imagemin-optipng` 位于 GIF 与 pngquant 之间，`imagemin-jpegtran` 位于 mozjpeg 与 WebP 之间。下载量只决定兼容顺序，不代表 codec 技术质量。原始数字、版本和发布时间见 [上游调研](../docs/research/upstream-landscape.md)。

## Phase 0：架构纵切面（已完成）

目标不是宣称完成 `imagemin-optipng` 兼容，而是用稳定的 Oxipng 验证完整路径。

交付：

- Cargo + pnpm 双 workspace；
- 首个纵切面使用深 `crates/imagemin` Module；Phase 6 后按 ADR 0008 拆为 core、格式 codec
  crates 与兼容 facade；
- 图片格式探测和稳定错误码；
- 顺序 native pipeline 与逐步统计；
- napi-rs `AsyncTask`；
- `imagemin()`、`.buffer()`、`optimize()`；
- 任意旧式 JS 函数插件；
- 私有 descriptor 和连续 native 段融合；
- `oxipng()` 原型 Adapter；
- Rust、binding、JS runtime、类型与文件 I/O 测试；
- VitePress 文档和 CI。

完成标准：

- `cargo test --workspace`、Clippy、格式检查通过；
- 真实 `.node` 加载测试通过；
- Oxipng 在 worker pool 执行，输出可被再次解析；
- JS 插件严格顺序、无插件复制、非法输出和非法 options 有契约测试；
- `pnpm build`、typecheck、tests、VitePress build 通过；
- macOS/Linux/Windows CI 至少完成真实 binding 加载和一次 PNG 优化。

## Phase 1：SVG / imagemin-svgo 12.x

风险：`imagemin-svgo` 的 options 直接传给 SVGO，完整插件配置面很大；现有 Rust SVG 优化器仍需单独验证兼容性。不能把“能缩小 SVG”描述为“兼容 SVGO”。

步骤：

1. 固定兼容基准 `imagemin-svgo@12` 与对应 SVGO 版本。
2. 建立包含 Figma、Illustrator、Inkscape、图标、CSS、`defs/use`、mask/filter、动画和恶意 XML 的 corpus。
3. 比较 Rust 候选（如 OXVG/SVGM）在维护性、许可证、WASM、构建矩阵和配置可映射性上的表现，形成 codec ADR。
4. 先实现有明确 golden/render test 的安全 preset；未知或未支持 option 报错。
5. 用 `resvg` 渲染前后 SVG，做像素/尺寸/可访问属性一致性测试；同时记录体积和吞吐。

完成标准：固定 corpus 无渲染回归；默认配置和已声明 options 有契约测试；与上游差异形成公开兼容表。

已落实的决策（2026-07-17）：公开 `svgo()` 固定使用 `svgo@4.0.2` 保留完整配置语义；显式 `svgm()` 使用 `svgm-core@0.3.8` 和 AsyncTask。原生入口已有 UTF-8、DTD/ENTITY、16 MiB、100,000 节点、256 层限制；Figma/Illustrator 上游样本、resvg 像素门禁、SVGO 差分矩阵和 CI benchmark 已完成。详见 ADR 0002。

## Phase 2：GIF / gifsicle 与无损 PNG 补充

### 2A GIF

- 固定 `imagemin-gifsicle@7` 行为；
- 支持 `interlaced`、`optimizationLevel`、`colors`；
- 真实 fixtures 覆盖单帧、动画、透明度、loop、局部帧、损坏输入；
- 验证帧数、时序、循环次数、逻辑尺寸和像素结果，而不只比较字节。

### 2B OptiPNG 兼容面

- 基于当前 Oxipng Adapter 增加 `optipng()` 兼容工厂；
- 显式映射 `optimizationLevel`、bit depth/color type/palette reductions；
- 记录 Oxipng 与 OptiPNG 算法差异，不承诺逐字节一致；
- APNG、ICC、gamma 和 metadata 策略写入 ADR。

已落实的决策（2026-07-29）：`gifsicle()` 生产执行固定源码自建的 Gifsicle 1.96，
8 个 GPL-2.0-only 平台包独立携带 provenance 和许可证；`gifsicle@5.3.0` 仅作开发
oracle。兼容入口支持 interlace/O1..O3/colors；`giflossless()` 提供 MIT/Apache
原生 delta path。Rust conformance 覆盖有限/无限 loop、delay、透明、局部帧、
Background/Previous disposal 与逐帧合成像素。`optipng()` 已修正 strip all、
level 0、grayscale switch、repair/transform output growth，并将 APNG 明确设为
pass-through。真实 `.node`、公开包语义 canonicalization 和 Phase 2 benchmark
均纳入门禁；详见 ADR 0003。

## Phase 3：PNG lossy / pngquant

- 固定 `imagemin-pngquant@10`；
- 候选实现优先评估 `imagequant` + PNG decoder/encoder + Oxipng 收尾；
- 支持 `quality: [min,max]`（0..1）、`speed`、`strip`、`dithering`、`posterize`；
- 质量下限失败语义必须与上游契约一致；
- 测试透明度、半透明边缘、调色板大小、色差、确定性和 metadata。

完成标准：options 全部验证；质量/体积回归有阈值；Linux GNU/musl、macOS、Windows 原生构建通过。

已落实的决策（2026-07-29）：`pngquant()` 固定 `imagemin-pngquant@10.0.0` 的语义，
生产执行项目从固定 tag、submodule commit 与 Cargo lock 自建的 pngquant 3.0.3。
GPL 进程边界覆盖全部公开 options、exit 99 quality floor、透明 palette 与差分矩阵；
APNG 为防止静默丢帧而 no-op，输入/输出/尺寸/时间均有硬上限。8 个独立 GPL 平台包、
provenance、许可证和发布 smoke 已接入，macOS ARM64 已实测。Quantette 因不支持 alpha、
缺少 pngquant 质量语义且要求 Rust 1.90，本阶段不公开；详见 ADR 0004。

## Phase 4：JPEG / mozjpeg 与 jpegtran

### 4A MozJPEG

- 固定 `imagemin-mozjpeg@10`；
- 第一批只承诺 `quality`、`progressive`；
- 再按 golden tests 增加 trellis、tune、DCT、quant table 等高级项；
- 优先评估 `mozjpeg-sys` 的静态链接、NASM/SIMD、跨平台和许可证。

### 4B jpegtran

- 独立表示无损优化，不与有损 `quality` 混为一组 options；
- 覆盖 progressive、arithmetic、EXIF orientation、ICC 和损坏 JPEG。

完成标准：解码尺寸/颜色空间/metadata 策略稳定；progressive scan 有结构测试；平台包 smoke test 通过。

已落实的决策（2026-07-29）：`mozjpeg()` 固定 `imagemin-mozjpeg@10.0.0` 的 option
shape，`jpegtran()` 固定 `imagemin-jpegtran@8.0.0` 的语义；生产路径使用项目从固定
源码自建的 MozJPEG 4.1.1 `cjpeg`/`jpegtran`，历史 npm 二进制仅作开发 oracle。完整
options、默认 progressive、EXIF/ICC/comment、灰度、独立解码误差、arithmetic matrix
与系数无损均有门禁，并修复上游 `quantBaseline` 参数 bug。8 目标构建、fingerprint、
许可证、发布校验和真实安装 smoke 已接入，macOS ARM64 已实测；详见 ADR 0005。

## Phase 5：WebP

- 固定 `imagemin-webp@8`；
- 支持 quality、alphaQuality、method、lossless、nearLossless、preset；
- crop/resize 应评估是否属于 imagemin codec Adapter，避免把通用图片变换塞进 core；
- 优先评估 `libwebp-sys`，并验证 GNU/musl/Windows/macOS 静态构建。

完成标准：PNG/JPEG/GIF 输入到 WebP 的格式变化、扩展名、透明度、动画政策和 metadata 均有契约测试。

已落实的决策（2026-07-17）：`webp()` 固定 `imagemin-webp@8.0.0` 与
`cwebp-bin@8.0.0`/libwebp 1.2.1 开发 oracle，覆盖完整公开 options、PNG/JPEG/TIFF/
静态 WebP、crop-first resize、metadata chunks、alpha lossless 与黑/白背景视觉门禁。
合法零值不再被上游 truthiness bug 忽略；APNG、animated WebP 与 multi-page TIFF 为
防止静态化而 no-op。文件 destination 根据最终 magic 改为 `.webp`。当前历史 x86
artifact 只用于开发，发布必须自建、修补安全问题、原生覆盖目标平台并带 provenance；
详见 ADR 0006。

## Phase 6：AVIF

`imagemin-avif` 不是 imagemin 官方组织包，且当前实现以 Sharp 为后端。先决定目标：兼容该社区包、提供项目原生 options，或二者并存。

- 比较 libavif/aom 与 ravif 在质量、速度、10-bit、alpha、WASM 和平台构建上的取舍；
- 明确 quality、speed、chroma subsampling、bit depth 和 metadata；
- AVIF 编码时间长，必须压测 libuv pool 竞争并决定是否引入独立受控线程池。

完成标准：公开目标和差异表明确；跨平台安装无需用户编译；取消/超时和资源上限有测试。

已落实的决策（2026-07-17）：`avif()` 以 `imagemin-avif@0.1.6` 的调用 shape 和默认
值为兼容起点，固定 `sharp@0.35.3` 并只在受限 Node child process 加载。支持 8-bit、
quality/lossless、4:2:0/4:4:4、直接 effort，并把上游无效的 speed 映射为 effort；
同时修复 global defaults 泄漏、undefined callback 和 EXIF Orientation 显示错误。
静态 PNG/JPEG/GIF/WebP/TIFF/AVIF 可转换，多帧/多页输入 no-op。像素、input/output、
metadata、stderr、V8 heap、线程和 wall time 均有限制；Phase 6 benchmark 包含 4-job
并发与事件循环延迟。10/12-bit、公开取消和 OS-level RSS hard limit 留在发布加固，
不能冒充已支持；详见 ADR 0007。

## 发布加固（当前）

Phase 0..6 已完成兼容纵切面，当前工作转为把已验证实现收敛成可重复发布的 RC：

1. **P0 基线修复（已完成）**：修复 Windows 版本脚本换行兼容、SVG fuzz finding 与
   独立 fuzz workspace 锁文件版本漂移，恢复本地完整门禁。
2. **P1 cwebp sidecar 纵切面（实现完成）**：固定并校验 libwebp 源码，完成 8 目标构建、
   manifest、平台 npm 包、运行时解析和真实转码 smoke；macOS ARM64 tarball 已实测，
   其余 7 个目标等待 CI 首次实跑证据。
3. **P2 其余 sidecar 与发布链（已完成）**：mozjpeg/jpegtran、pngquant 与 Gifsicle
   已完成，verify/pack/smoke/publish 覆盖全部 24 个 sidecar 平台包。
4. **P3 RC 演练（进行中）**：2026-07-29 已完成 macOS ARM64 本地 rehearsal；
   继续完成 GPL 法律确认、SBOM、其余 7 平台 tarball 安装与每 codec smoke，再执行
   不发布到 registry 的完整 34 包 release rehearsal。

sidecar 的 pin、许可证边界、包结构与运行时失败语义见 ADR 0009。只有各阶段对应的
自动化验证与文档同步完成后，阶段才可标记完成。

## 每个 codec 阶段的固定工作包

1. codec ADR：依赖、许可证、链接、MSRV、WASM、维护风险。
2. Rust Adapter：精确 options、deny unknown fields、错误分类。
3. corpus：合法、边界、损坏、metadata、动画/透明度。
4. golden/conformance：结构和可视结果优先，不依赖不稳定的逐字节相等。
5. N-API：AsyncTask、Buffer 所有权、Promise rejection、错误码。
6. JS 工厂：兼容 options、直接调用、混合第三方插件、native 段融合。
7. package/CI：平台加载、tarball 内容、缺失 binding 诊断、真实安装 smoke test。
8. benchmark：吞吐、p50/p95、峰值内存、输出大小、worker-pool 竞争。
9. 文档：兼容版本、已支持 options、差异、迁移示例。

## v1.0 门槛

- 指定六类插件均有稳定公开兼容表；
- 根包和平台 optional packages 可重复发布；
- 所有支持平台执行真实 codec smoke test；
- Node 主版本矩阵和最低系统版本有明确政策；
- fuzz/corpus 回归、资源上限和安全输入政策落地；
- 文档、迁移指南、benchmark 方法和 release preflight 完整。
