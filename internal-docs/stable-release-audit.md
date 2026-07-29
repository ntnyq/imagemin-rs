# Stable Release Native Dependency Audit

- 审计日期：2026-07-30
- 证据截止日期：2026-07-30（Asia/Shanghai）
- 范围：仓库固定的原生 sidecar、`sharp@0.35.3` 在八个平台目标上的预编译运行时、相关许可证与 npm 供应链证明
- 建议门槛状态：**CONDITIONAL PASS（RC 分发闭环完成；G4 公开试用进行中）**

> 本文是一次发布时点的安全与许可证证据快照，不是“没有漏洞”的保证，也不是法律意见。NVD、上游公告和 npm 证明都可能滞后或不完整。

## 结论摘要

截至证据截止日，没有确认到适用于当前实际编译面的已知未修复漏洞。尤其是：

- `sharp@0.35.3` / `libvips 8.18.3` 已越过 2026 年四项 libvips 漏洞的修复边界；
- `libheif 1.23.1`、`libpng 1.6.58`、`libtiff 4.7.2`、`libxml2 2.15.3` 和 `libwebp 1.6.0` 均包含所核查公告的修复；
- `MozJPEG 4.1.1` 内含的 libjpeg-turbo 基线仍会命中 `CVE-2023-2804` 的版本扫描范围，但仓库显式构建 8-bit 版本，未启用漏洞所需的 12-bit lossless 解码面。构建脚本会核对实际 CMake cache，OpenVEX 记录该结论。

安全侧技术门槛已完成：

1. `security/imagemin-rs.openvex.json` 覆盖 `CVE-2023-2804` 和
   `CVE-2026-11979`；版本升级脚本与任务测试保持 VEX 和发布版本一致。
2. MozJPEG 显式传入 `WITH_12BIT=OFF`，并在每次平台构建中核对
   `CMakeCache.txt`；8 平台安装冒烟会拒绝 Sharp 包中出现 `xmlcatalog` 命令。
3. `verify-aom-security.mjs` 从 AOM 官方 Gitiles 历史确认 `v3.14.1` 的 tag
   commit 包含两项指定修复；安装冒烟同时核对运行时实际报告的 AOM 版本。
4. tag workflow 会发布经 pins 校验的 Gifsicle、pngquant 与 libimagequant
   源码归档、SHA-256 manifest、构建指引和 OpenVEX。

2026-07-30，维护者选择 L2（Sharp 不进入默认安装闭包）及 GPL 随每个平台 npm 包
交付源码/构建材料。原来的“分发模型未决”人工 HOLD 已关闭；该决定不构成法律意见。
`v0.1.0-rc.9` 的公开 Release workflow 已通过 WASM 与八平台真实 tarball smoke，
证明默认无 Sharp 会返回可操作错误，显式安装 `sharp@0.35.3` 后全部 codec 可运行，
并验证 GPL 包内源码、构建材料和许可/AOM 文本摘要。

稳定版现在为 conditional pass。完整事实模型见
[`docs/research/native-distribution-license-model.md`](../docs/research/native-distribution-license-model.md)，
已选择的交付路径、责任人与技术退出条件见
[`license-release-signoff.md`](./license-release-signoff.md)。`0.1.0-rc.9` 已完成
35 包技术 bundle 与 OIDC publish、八平台与两种 Sharp 路径、WASM 浏览器 smoke、
provenance 和公开 registry 回读。公开试用已从 2026-07-30 06:29 +08:00 开始；
稳定版仍须通过 G4 的 14 天和消费者证据，以及 G5 最终 preflight。本次证据没有显示
其他安全阻断项。

## 证据范围与方法

版本和构建面来自仓库的：

- `tasks/sidecars/pins.json`
- `tasks/sidecars/build-cwebp.sh`
- `tasks/sidecars/build-gifsicle.sh`
- `tasks/sidecars/build-mozjpeg.sh`
- `tasks/sidecars/build-pngquant.sh`
- `tasks/sidecars/pngquant.Cargo.lock`
- `security/native-dependency-policy.json`
- `security/imagemin-rs.openvex.json`
- `.release/npm/release-sbom.cdx.json`
- `.release/npm/release-dependencies.cdx.json`
- [`v0.1.0-rc.9` artifact and smoke workflow](https://github.com/ntnyq/imagemin-rs/actions/runs/30487591906)
- [`v0.1.0-rc.9` 35-package OIDC publish workflow](https://github.com/ntnyq/imagemin-rs/actions/runs/30494894639)

外部证据只使用上游仓库、上游发布说明/安全公告、NVD、GNU 官方许可证和 npm registry/文档。核查包括精确版本、非语义版本提交、已知漏洞的版本边界，以及漏洞描述中的功能是否存在于实际构建中。未进行独立渗透测试或代码级全量漏洞审计。

## 已核查版本

### 仓库固定 sidecar

| 产物       | 固定版本         | 直接内含/链接的原生组件                                               | 构建面                                                                               |
| ---------- | ---------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `cwebp`    | libwebp `1.6.0`  | libjpeg-turbo `3.2.0`、libpng `1.6.58`、libtiff `4.7.2`、zlib `1.3.2` | 静态链接；关闭 libpng tools、libtiff tools/tests/docs/contrib、PixarLog 等非必要功能 |
| `mozjpeg`  | MozJPEG `4.1.1`  | 上游基于 libjpeg-turbo `2.1.3`                                        | 静态 `cjpeg`/`jpegtran`；显式 8-bit；关闭 TurboJPEG、PNG 和 arithmetic coding        |
| `pngquant` | pngquant `3.0.3` | libimagequant commit `6e9805761851f1a8320380b9f563961f892ec6ba`       | Cargo `--locked --no-default-features --features static,z-static`                    |
| `gifsicle` | Gifsicle `1.96`  | 无额外动态原生依赖                                                    | POSIX 构建关闭 SIMD 与 threads；Windows 使用固定 MSVC 构建                           |

每个来源归档和固定提交在 `pins.json` 中都有 SHA256。发布审计应继续把“来源归档摘要”和“最终平台二进制摘要”作为两套独立证据。

### Sharp 运行时 SBOM

仓库记录的 `sharp@0.35.3` 运行时与官方
[`sharp-libvips v1.3.2` 发布](https://github.com/lovell/sharp-libvips/releases/tag/v1.3.2)
一致：

| 组件          | 版本                       | 组件       | 版本             |
| ------------- | -------------------------- | ---------- | ---------------- |
| sharp         | `0.35.3`                   | vips       | `8.18.3`         |
| aom           | `3.14.1`                   | archive    | `3.8.8`          |
| cairo         | `1.18.4`                   | cgif       | `0.5.3`          |
| exif          | `0.6.26`                   | expat      | `2.8.2`          |
| ffi           | `3.6.0`                    | fontconfig | `2.18.1`         |
| freetype      | `2.14.3`                   | fribidi    | `1.0.16`         |
| glib          | `2.89.1`                   | harfbuzz   | `14.2.1`         |
| heif          | `1.23.1`                   | highway    | `1.4.0`          |
| imagequant    | `2.4.1`                    | lcms       | `2.19.1`         |
| mozjpeg       | commit `0826579`           | pango      | `1.58.0`         |
| pixman        | `0.46.4`                   | png        | `1.6.58`         |
| proxy-libintl | `0.5`                      | rsvg       | `2.62.90`        |
| tiff          | commit `d01a94b`（v4.7.2） | uhdr       | commit `1acdbed` |
| webp          | `1.6.0`                    | xml2       | `2.15.3`         |
| zlib-ng       | `2.3.3`                    |            |                  |

Sharp 的 `imagequant 2.4.1` 是 `lovell/libimagequant` 的 BSD-2-Clause 分支，不能与 pngquant sidecar 固定的 GPL-3.0-or-later `ImageOptim/libimagequant` 混为一谈。精确许可证清单见官方
[`THIRD-PARTY-NOTICES.md`](https://github.com/lovell/sharp-libvips/blob/v1.3.2/THIRD-PARTY-NOTICES.md)。

## 逐项安全结论

状态含义：

- **PASS**：所核查的已知漏洞不适用于当前版本/构建面；
- **PASS + VEX**：结论依赖精确提交或禁用功能，发布物必须携带可复核证据；
- **MONITOR**：未找到匹配的已发布公告，但上游覆盖有限，不能推导为“无漏洞”。

| 组件                                                                                                                                                     | 状态                             | 结论与第一方/NVD 证据                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sharp `0.35.3` / libvips `8.18.3`                                                                                                                        | **PASS**                         | Sharp 的 [GHSA-f88m-g3jw-g9cj](https://github.com/lovell/sharp/security/advisories/GHSA-f88m-g3jw-g9cj) 说明 `<0.35.0` 受继承的 `CVE-2026-33327`、`CVE-2026-33328`、`CVE-2026-35590`、`CVE-2026-35591` 影响，修复版本为 `0.35.0`，并推荐当前 `0.35.3` / libvips `8.18.3`。libvips 的 [v8.18.3 发布](https://github.com/libvips/libvips/releases/tag/v8.18.3) 与运行时版本一致。                                                                                                                                                                            |
| libheif `1.23.1`                                                                                                                                         | **PASS**                         | [v1.23.1 发布说明](https://github.com/strukturag/libheif/releases/tag/v1.23.1)列出 `CVE-2026-62289`、`CVE-2026-62291`、`CVE-2026-62292`、`CVE-2026-62377` 等修复；此前影响 `<1.22.0` 的 [CVE-2026-32740](https://nvd.nist.gov/vuln/detail/CVE-2026-32740) 与 [CVE-2026-32814](https://nvd.nist.gov/vuln/detail/CVE-2026-32814) 也已越过修复边界。                                                                                                                                                                                                          |
| AOM `3.14.1`                                                                                                                                             | **PASS + ASSERTION**             | NVD 的 [CVE-2026-56208](https://nvd.nist.gov/vuln/detail/CVE-2026-56208) 至同组条目引用上游修复，但没有稳定的 semver 边界。核查的 `3.14.1` 源码已含 [LAP buffer 修复提交 `243f8ae`](https://aomedia.googlesource.com/aom/+/243f8ae84b) 和 [SVC layer bounds 修复提交 `a93ba0f`](https://aomedia.googlesource.com/aom/+/a93ba0ffaa)。release audit 从 AOM 官方 tag 历史断言两个完整 commit，8 平台 smoke 再核对 `sharp.versions.aom`。                                                                                                                      |
| libwebp/cwebp `1.6.0`                                                                                                                                    | **PASS**                         | 官方 [v1.6.0 源码](https://chromium.googlesource.com/webm/libwebp/+/refs/tags/v1.6.0)晚于修复 `CVE-2023-4863` 的 `1.3.2`；上游 [NEWS](https://chromium.googlesource.com/webm/libwebp/+/4ebf0b0ac8888673171162ad50afbfafbada4c8f/NEWS)明确记录该修复。NVD：[CVE-2023-4863](https://nvd.nist.gov/vuln/detail/CVE-2023-4863)、[CVE-2023-1999](https://nvd.nist.gov/vuln/detail/CVE-2023-1999)。                                                                                                                                                               |
| MozJPEG `4.1.1` sidecar                                                                                                                                  | **PASS + VEX**                   | [MozJPEG v4.1.1](https://github.com/mozilla/mozjpeg/releases/tag/v4.1.1)基于 libjpeg-turbo `2.1.3`，因此纯版本扫描会命中 [CVE-2023-2804](https://nvd.nist.gov/vuln/detail/CVE-2023-2804) 的 `<2.1.90` 范围。NVD 和 [libjpeg-turbo 3.0.0 修复说明](https://github.com/libjpeg-turbo/libjpeg-turbo/releases/tag/3.0.0)把可利用面限定在 12-bit lossless decoder；仓库显式传入 `WITH_12BIT=OFF` 并核对 CMake cache，只发布 8-bit `cjpeg`/`jpegtran`。OpenVEX 以 `vulnerable_code_not_present` 记录该构建事实。                                                 |
| libjpeg-turbo `3.2.0`（cwebp）                                                                                                                           | **PASS**                         | cwebp 链接的不是上述 `2.1.3` 基线，而是官方 [libjpeg-turbo 3.2.0](https://github.com/libjpeg-turbo/libjpeg-turbo/releases/tag/3.2.0)，已越过 `CVE-2023-2804` 修复边界。                                                                                                                                                                                                                                                                                                                                                                                    |
| Gifsicle `1.96`                                                                                                                                          | **PASS / MONITOR**               | [CVE-2023-44821](https://nvd.nist.gov/vuln/detail/CVE-2023-44821) 是有争议的拒绝服务条目，影响范围止于 `1.94`；固定版本为 `1.96`。上游没有完整、持续的安全公告覆盖，因此只能对已查条目判定 PASS。官方项目与发布来源：[Gifsicle](https://www.lcdf.org/gifsicle/)。                                                                                                                                                                                                                                                                                          |
| pngquant `3.0.3` / GPL libimagequant pinned commit                                                                                                       | **MONITOR**                      | 上游 [pngquant Security](https://github.com/kornelski/pngquant/security) 与 [libimagequant Security](https://github.com/ImageOptim/libimagequant/security) 均未发布 advisory，也未提供安全策略。这不是“没有漏洞”的证据；保持输入资源限制、崩溃回归测试和 fuzzing。                                                                                                                                                                                                                                                                                         |
| libpng `1.6.58`                                                                                                                                          | **PASS**                         | [v1.6.58 官方发布](https://github.com/pnggroup/libpng/releases/tag/v1.6.58)已越过 [CVE-2025-65018](https://nvd.nist.gov/vuln/detail/CVE-2025-65018) 的 `<1.6.51` 和 [CVE-2026-34757](https://nvd.nist.gov/vuln/detail/CVE-2026-34757) 的 `<1.6.57` 修复边界。[CVE-2026-3713](https://nvd.nist.gov/vuln/detail/CVE-2026-3713) 位于 `pnm2png` contrib tool；版本已修复，且 sidecar/Sharp 均不发布该工具。                                                                                                                                                    |
| libtiff `4.7.2` / commit `d01a94b`                                                                                                                       | **PASS**                         | 上游 [v4.7.2 发布说明](https://libtiff.gitlab.io/libtiff/releases/v4.7.2.html)与 [commit `d01a94b`](https://gitlab.com/libtiff/libtiff/-/commit/d01a94b)对应，包含 [CVE-2026-4775](https://nvd.nist.gov/vuln/detail/CVE-2026-4775) 和 [CVE-2026-12912](https://nvd.nist.gov/vuln/detail/CVE-2026-12912) 相关修复；仓库 sidecar 与 sharp-libvips 还关闭了 PixarLog。[CVE-2025-61145](https://nvd.nist.gov/vuln/detail/CVE-2025-61145) 位于较旧版本和未发布的 `tiffcrop` 工具。                                                                              |
| libxml2 `2.15.3`                                                                                                                                         | **PASS + VEX**                   | [CVE-2026-6732](https://nvd.nist.gov/vuln/detail/CVE-2026-6732) 影响 `2.13.0` 至 `<2.15.3`，[CVE-2026-0989](https://nvd.nist.gov/vuln/detail/CVE-2026-0989) 影响 `<2.15.2`；当前版本处于修复边界之后。较新的 [CVE-2026-11979](https://nvd.nist.gov/vuln/detail/CVE-2026-11979) 位于 `xmlcatalog --shell` 命令行工具，Sharp 运行时只链接库、不发布或调用该工具；8 平台安装冒烟会递归拒绝该命令，OpenVEX 记录为 `vulnerable_code_not_in_execute_path`。官方 [2.15.3 NEWS](https://download.gnome.org/sources/libxml2/2.15/libxml2-2.15.3.news)记录安全修复。 |
| zlib-ng `2.3.3`                                                                                                                                          | **MONITOR**                      | [v2.3.3 官方发布](https://github.com/zlib-ng/zlib-ng/releases/tag/2.3.3)包含 `minigzip` 溢出修复；[上游 Security 页面](https://github.com/zlib-ng/zlib-ng/security)没有已发布 advisory。NVD 中 `minizip-ng` 条目属于另一个项目，不能归入本 SBOM 的 zlib-ng core。                                                                                                                                                                                                                                                                                          |
| zlib `1.3.2`（cwebp）                                                                                                                                    | **MONITOR**                      | 精确来源和摘要已固定；本次官方/NVD 定向检索未定位到适用于该版本和当前静态构建面的未修复条目。继续纳入发布时数据库快照，不把“未命中”解释为安全保证。                                                                                                                                                                                                                                                                                                                                                                                                        |
| cairo、cgif、exif、expat、ffi、fontconfig、freetype、fribidi、glib、harfbuzz、highway、lcms、libarchive、pango、pixman、proxy-libintl、librsvg、ultrahdr | **INVENTORY VERIFIED / MONITOR** | 版本与 `sharp-libvips v1.3.2` 官方发布清单一致，许可证与来源见其 [官方第三方声明](https://github.com/lovell/sharp-libvips/blob/v1.3.2/THIRD-PARTY-NOTICES.md)。本次重点检索没有形成这些组件的独立“无漏洞”结论；自动化扫描必须覆盖完整 SBOM，任何新命中应回到实际调用面逐项判定。                                                                                                                                                                                                                                                                           |

## npm 完整性、签名与 provenance

`0.1.0-rc.9` 的 35 个项目包已从公开 registry 逐包回读。每包都满足：

- `next` 精确指向 `0.1.0-rc.9`；
- 版本元数据包含 `dist.integrity` 和一条 npm registry signature；
- attestation endpoint 可读并返回两条证明记录；
- 发布来源是同一 immutable tag 的受保护 GitHub Actions environment。

公开 root 包的
[`attestation`](https://registry.npmjs.org/-/npm/v1/attestations/imagemin-rs@0.1.0-rc.9)
和 35 包
[OIDC publish workflow](https://github.com/ntnyq/imagemin-rs/actions/runs/30494894639)
提供可复核入口。registry fresh install 还验证了默认无 Sharp、显式
`sharp@0.35.3` 的 11 codec，以及 `@imagemin-rs/wasm@next` 的 Chromium 路径。

针对项目八个平台目标核查了 15 个 npm 包：`sharp@0.35.3`、Darwin/Linux 的 addon 与 libvips 平台包，以及 Windows arm64/x64 合并包。registry 元数据均包含：

- `dist.integrity`
- npm registry signature
- SLSA v1 provenance attestation URL

可复核的 registry 入口包括：

- [`sharp@0.35.3` attestation](https://registry.npmjs.org/-/npm/v1/attestations/sharp@0.35.3)
- [`@img/sharp-libvips-darwin-arm64@1.3.2` attestation](https://registry.npmjs.org/-/npm/v1/attestations/@img%2fsharp-libvips-darwin-arm64@1.3.2)

registry 声明的许可证分别为：`sharp` 为 Apache-2.0，libvips 平台包为 LGPL-3.0-or-later，Windows 合并包为 `Apache-2.0 AND LGPL-3.0-or-later`。npm 官方说明强调 provenance 用于关联源码和构建环境，但不能单独保证产物没有恶意代码；发布 CI 还应执行
[`npm audit signatures`](https://docs.npmjs.com/generating-provenance-statements/) 并核对 attestation subject digest 与实际 tarball。

## GPL 与其他许可证证据

### Gifsicle

[Gifsicle 官方仓库](https://github.com/kohler/gifsicle)明确写明 “GNU GPL Version 2 (and only Version 2)”，固定标签的
[`COPYING`](https://raw.githubusercontent.com/kohler/gifsicle/v1.96/COPYING)
也是 GPL-2.0-only。仓库同时说明作者可在特定条件下提供替代许可证；在没有单独、明确的授权前，发布审计不能假定项目已取得该替代许可。

GPLv2 [第 3 节](https://www.gnu.org/licenses/old-licenses/gpl-2.0.en.html#section3)为目标代码分发列出随附完整对应源码、至少三年书面提供源码等选项，并把控制编译与安装的脚本纳入源码范围。

### pngquant 与 libimagequant

- [`pngquant 3.0.3 COPYRIGHT`](https://raw.githubusercontent.com/kornelski/pngquant/3.0.3/COPYRIGHT)：GPL-3.0-or-later；
- [固定 libimagequant commit 的 `COPYRIGHT`](https://raw.githubusercontent.com/ImageOptim/libimagequant/6e9805761851f1a8320380b9f563961f892ec6ba/COPYRIGHT)：GPL-3.0-or-later。

GPLv3 [第 1 节](https://www.gnu.org/licenses/gpl-3.0.en.html#section1)把生成、安装、运行和修改目标代码所需的源码与脚本纳入 Corresponding Source；[第 6 节](https://www.gnu.org/licenses/gpl-3.0.en.html#section6)规定了目标代码分发时可采用的对应源码交付方式。

### 当前证据的边界

`0.1.0-rc.9` npm sidecar notice 带有许可证文本、精确上游 URL、版本/提交和 SHA256。
同版本 tag workflow 保存了 pngquant lockfile 中全部 45 个 registry 源码归档，以及
实际 build scripts、Cargo lockfile、MSVC 配置和 pins；两个附加 tar 及其 manifest
是确定性生成。这些材料同时存在于每个对应 GPL npm tarball，并在同版本 GitHub
Release 备份。

恢复演练重新下载全部八个公开 Release 资产，逐项核对 GitHub 记录的 SHA-256；又从
npm 重新取得 darwin-arm64 的 Gifsicle/pngquant 平台包，确认许可证、上游源码、45
个 Cargo 源码归档、构建脚本、source-to-binary manifest 的入口和摘要与 Release
备份一致。该机制有助于复现和追踪，却不能从技术证据本身证明：

- 所选方式满足 GPLv2 §3 或 GPLv3 §6；
- 对应源码包含所有必要的锁文件、补丁与构建/安装脚本；
- 源码会在要求的期限内持续可用；
- sidecar 作为独立进程和独立可选 npm 包时，主包与原生程序的聚合/派生关系应如何定性。

因此本文不作合规或不合规结论。维护者已选择不作 System Library 主观排除的保守
工程交付边界；外部法律复核仍建议进行。`rc.9` 已证明 npm tarball 与 GitHub Release
同时保存固定的 `Cargo.lock`、全部 registry 源码、项目构建脚本、pins、许可证与
摘要，后续候选版和稳定版必须继续执行同一契约。

Sharp 运行时还包含 LGPL-3.0-or-later 组件，AOM 包含上游专利许可文本。具体替换/重新链接、源码/notice 和专利文本交付义务，同样应由维护者和律师按最终包装方式确认；证据入口为
[`sharp-libvips THIRD-PARTY-NOTICES.md`](https://github.com/lovell/sharp-libvips/blob/v1.3.2/THIRD-PARTY-NOTICES.md)。

## 稳定版自动化建议

1. **完整 SBOM**：为每个 sidecar 和每个平台 Sharp 运行时生成 CycloneDX；给所有组件补齐 purl/CPE、源码 URL、归档 SHA256、提交 SHA 和构建 feature。对 `tiff`、`mozjpeg`、`uhdr` 等非 semver 值不得只保留短提交名。
2. **发布时漏洞快照**：在 tag 构建中查询 NVD 与上游安全公告，保存原始 JSON、查询时间和规则版本。High/Critical 命中或版本边界未知时失败，除非已有经复核 VEX。
3. **OpenVEX/CSAF**：已覆盖 `CVE-2023-2804` 与 `CVE-2026-11979`，并对 AOM
   提交边界建立官方源码历史断言。后续可为 `CVE-2026-12912` 额外记录“版本已修复且
   PixarLog 未构建”的纵深证据。
4. **构建面断言**：已显式关闭并核对 MozJPEG 12-bit/arithmetic 路径，8 平台 smoke
   会拒绝 `xmlcatalog`。继续把 PixarLog 等配置扩展到 CMake cache、二进制符号和
   运行时 smoke，而不是只依赖脚本文本。
5. **npm 证明验证**：`rc.9` 的 35 个项目包已核对 registry `dist.integrity`、
   signature 与 attestation endpoint。稳定版 preflight 还应对八个平台解析到的全部
   15 个 Sharp 包执行 `npm audit signatures`，并保存 subject digest 验证结果。
6. **SBOM diff 门槛**：八个平台运行时组件集合应与批准清单一致；任何新增、删除、版本变化或许可证变化都要求人工复核。
7. **sidecar 可复现证据**：同时校验来源归档 SHA256、每个平台最终二进制 SHA256 和 provenance；从空缓存重建并比较结果。
8. **GPL 源码 bundle**：已选择每个 GPL npm tarball 随包源码，并在 tag Release
   同步备份经摘要验证的源码资产；`rc.9` 已证明八平台执行该契约并完成公开恢复演练。
9. **输入面防护**：保持子进程超时、内存/文件大小限制和临时目录隔离；将上游修复样本及 fuzz crash corpus 纳入回归。

## 仍需人工确认

- **外部法律复核（建议、非当前工程 gate）**：复核 Gifsicle GPL-2.0-only 与
  pngquant/libimagequant GPL-3.0-or-later 的聚合定性、随包源码边界和可用期限。
- **安全维护者**：最终签署接受 `MozJPEG 4.1.1 + 明确 8-bit VEX`；自动化已验证构建
  配置，但接受风险仍是发布责任人的决定。
- **维护者**：保持 Sharp 为可选 peer；若恢复默认安装，重新打开 LGPL 组件的
  notice/源码/替换路径和 AOM 专利文本审计。
- **发布负责人**：确认八个平台最终 tarball、签名、attestation、SBOM 和 sidecar 二进制摘要与本审计记录完全一致。
- **安全负责人**：确认接受本次数据库覆盖边界；“上游无 advisory”或“查询未命中”都不等于无漏洞。
