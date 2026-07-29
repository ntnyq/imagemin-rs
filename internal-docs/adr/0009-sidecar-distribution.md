# ADR 0009：自建 sidecar 二进制的构建与分发模型

- 状态：Accepted（GPL 再分发部分在首次发布前仍需 maintainer 的法律确认，见"未决项"）
- 日期：2026-07-27
- 关联：ADR 0003（gifsicle）、0004（pngquant）、0005（mozjpeg/jpegtran）、0006（cwebp）

## 背景

Phase 2..5 的兼容 sidecar 一直以 npm 历史包为开发 oracle：`cwebp-bin@8.0.0`、
`gifsicle@5.3.0`、`pngquant-bin@9.0.0`、`mozjpeg@8.0.0`、`jpegtran-bin@7.0.0`。它们
作为公开包的硬 runtime 依赖存在四类不可发布的问题：

1. **安全**：`cwebp-bin@8.0.0` 携带 libwebp 1.2.1，早于 CVE-2023-4863（VP8L 解码
   heap overflow，被在野利用）的 1.3.2 修复版。`webp()` 接受 WebP 输入，解码面真实
   暴露。
2. **版本漂移**：`mozjpeg@8.0.0` 的二进制自报 mozjpeg 3.2（2018），`jpegtran-bin@7`
   自报 libjpeg-turbo 1.5.1（2016），与包版本宣称的行为基线脱节；macOS `optipng-bin`
   自报 0.7.6 而非 0.7.7 属同类问题。
3. **安装模型**：五个 `*-bin` 包依赖 postinstall 下载并带源码编译回退。
   `THIRD_PARTY_NOTICES.md` 已明确"运行时下载与安装期编译回退不是可接受的发布
   路径"；且 pnpm ≥ 10 与 Yarn Berry 默认拦截 postinstall，用户拿到的是没有二进制的
   空壳包，而当前 smoke 只用 npm 验证。
4. **许可证**：gifsicle（GPL-2.0）与 pngquant（GPL-3.0）二进制经由硬依赖无条件进入
   每个安装树，而根包声明 MIT，license metadata 与实际分发内容不一致。

## 决策

### 上游 pin

每个 sidecar 从固定 upstream tag 的源码构建，SHA-256 锁定源码 archive 与产物：

| 工具            | 上游                            | pin      | 许可证                    | 替代的 dev oracle |
| --------------- | ------------------------------- | -------- | ------------------------- | ----------------- |
| cwebp           | webmproject/libwebp             | `v1.6.0` | BSD-3-Clause              | `cwebp-bin@8`     |
| cjpeg (mozjpeg) | mozilla/mozjpeg                 | `v4.1.1` | IJG + BSD-3-Clause + Zlib | `mozjpeg@8`       |
| jpegtran        | mozilla/mozjpeg（同一构建产物） | `v4.1.1` | 同上                      | `jpegtran-bin@7`  |
| pngquant        | kornelski/pngquant              | `3.0.3`  | GPL-3.0-or-later          | `pngquant-bin@9`  |
| gifsicle        | kohler/gifsicle                 | `v1.96`  | GPL-2.0                   | `gifsicle@5.3.0`  |

mozjpeg 一次构建同时产出 `cjpeg` 与 `jpegtran`，一并修正 3.2/1.5.1 漂移。AVIF 的
Sharp 运行时不在本 ADR 范围（其审计见产品完成度审计与 ADR 0007）；OptiPNG 兼容面由
原生 Oxipng 提供，无 sidecar；`svgo` 为纯 JS 依赖。

### 构建管线

`.github/workflows/sidecars.yml` 按 release workflow 相同的 8 个目标构建：
`darwin-{arm64,x64}`、`linux-{arm64,x64}-{gnu,musl}`、`win32-{arm64,x64}-msvc`。
原则：

- 源码从 pinned tag 获取并校验 SHA-256，不使用任何预编译产物；
- musl 目标全静态链接；gnu 目标在受控 glibc 基线容器内构建（下限跟随 Node 22 的
  glibc ≥ 2.28 政策）；macOS 双架构由 clang `-arch` 交叉产出；Windows arm64 使用
  原生 `windows-11-arm` runner；
- 每个产物记录 `{schema, tool, version, target, binary, bytes, sha256, sources}` 到
  manifest；`sources` 保存全部直接构建输入的版本、URL 与 SHA-256，作为发布
  fingerprint 与 SBOM 的输入；
- 升级任何 pin 必须走 ADR 修订加 conformance 重跑，不允许浮动版本。

### npm 分发

按许可证族拆包，每平台一个包，版本与发布单元同锁：

- `@imagemin-rs/sidecars-<platform>`：cwebp、cjpeg、jpegtran（BSD/IJG/Zlib/libpng/
  libtiff 族）；
- `@imagemin-rs/sidecar-pngquant-<platform>`：GPL-3.0-or-later，含完整许可证文本；
- `@imagemin-rs/sidecar-gifsicle-<platform>`：GPL-2.0，含完整许可证文本。

三族 × 8 平台 = 24 个新包，均带 `os`/`cpu`/`libc` 过滤与二进制白名单。根包
`imagemin-rs` 将它们列为 optionalDependencies：默认安装保持与上游 imagemin 生态一致
的开箱即用行为；不需要 GPL 工具的用户可用包管理器的 optional/overrides 机制排除，
license metadata 首次做到逐包准确。GPL 二进制以独立进程执行、独立 npm 包分发，属
聚合而非派生；此判断以及"随包附带 GPL 文本 + 源码 offer 指向 pinned tag"的做法需
maintainer 在首次发布前确认。

### 运行时解析

各 JS adapter 的二进制解析顺序改为：项目 sidecar 包（按当前平台三元组）→ 结构化
`ERR_IMAGEMIN_CODEC` 错误并附安装提示。发布路径不再解析 `*-bin` 包，也没有任何
运行时下载。`*-bin` 与 `imagemin-*` 官方插件降级为 devDependencies，仅作 parity
oracle 使用。

### Parity 语义调整

encoder 升级（libwebp 1.2.1 → 1.6.0、mozjpeg 3.2 → 4.1.1）后，与历史 oracle 的
逐字节一致不再是目标，也不可能维持。差分矩阵拆为两层：

1. **选项映射 parity**：CLI 参数构造、错误面、文件 destination 语义与上游插件继续
   逐项对齐（现有测试保留）；
2. **输出 conformance**：结构/像素/独立 decoder 门禁验证新 encoder 输出，跨平台
   逐字节一致只在统一自建 artifact 之间承诺（与 ADR 0006 已声明的口径一致）。

## 后果

- 消除 CVE-2023-4863 暴露面与 postinstall 供应链面，pnpm ≥ 10 安装开箱即用；
- 安装体积从"五个下载器 + 回退编译工具链"变为一个平台原生包集合；
- 发布单元从 10 包增至 34 包，`verify/pack/smoke/publish` 脚本与 release workflow
  必须逐包覆盖 sidecar 家族；
- conformance 基线迁移到新 encoder 版本时，受影响的 byte-parity 测试需要显式改写为
  两层语义，属一次性成本。

## 未决项

- maintainer 对 GPL 再分发模型（聚合判断、随包文本、源码 offer 形式）的法律确认；
- Windows gifsicle 的构建工具链选择（MSVC 直构 vs llvm-mingw），在 P1.4 落地时定；
- cwebp 已进入 release workflow，并覆盖版本、PNG/JPEG/TIFF 构建期 smoke 与完整
  tarball smoke；其余 sidecar 在 P2 逐个补齐同等门禁。
