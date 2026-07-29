# 原生分发许可证事实模型：GPL、LGPL 与 AOM 专利许可

> 核查日期：2026-07-29；分发决策更新：2026-07-30（Asia/Shanghai）  
> 对象：Gifsicle 1.96、pngquant 3.0.3、固定的 libimagequant 提交、
> `sharp@0.35.3` / `sharp-libvips@1.3.2`、`@imagemin-rs/wasm`  
> 状态：**事实模型完成；维护者已选择 L2 与 GPL 随包源码。本文不作法律意见或合规结论。**

## 结论摘要

当前工程已经把 GPL sidecar 与 MIT N-API addon 拆成独立 npm 包并通过子进程调用，
也已在 `v0.1.0-rc.7` GitHub Release 保存精确上游源码归档。2026-07-30，维护者进一步
选择 L2（Sharp 为可选 peer）及 GPL 随每个平台包交付源码/构建材料。以下缺口描述
已发布 `rc.6`/`rc.7` 的历史事实，以及下一个完整 RC 必须关闭的证据：

1. **公开版本尚未形成匹配闭环。** npm 上的 Gifsicle/pngquant sidecar 最新为
   `0.1.0-rc.6`，而
   [`v0.1.0-rc.6` GitHub Release](https://github.com/ntnyq/imagemin-rs/releases/tag/v0.1.0-rc.6)
   没有源码资产；[`v0.1.0-rc.7` GitHub Release](https://github.com/ntnyq/imagemin-rs/releases/tag/v0.1.0-rc.7)
   有精确源码资产，但匹配的 `rc.7` GPL sidecar 没有发布到 npm。现状只有上游 URL，
   没有一个公开版本同时具备匹配二进制与项目控制的同版本源码资产。
2. **GPL 交付路径已选择、尚待公开 RC 证明。** Gifsicle 的 GPLv2 §3 与
   pngquant/libimagequant 的 GPLv3 §6 可用选项不同；维护者选择不依赖跨下载面的
   保守模型，把匹配源码与构建材料放入各自平台 npm tarball，并把 GitHub Release
   资产作为备份。
3. **pngquant 的 Corresponding Source 边界尚未由公开 RC 证明完整。** `rc.7` 资产保存
   pngquant、libimagequant 源码，tag 中保存项目构建脚本和 `Cargo.lock`，但没有归档
   crates.io 依赖源码。当前工作树已增加 lockfile 全部 45 个 registry 源码归档和
   build-material tar；仍须由新 RC 证明发布结果，并按最终链接面确认 System
   Library/通用工具排除项。
4. **L2 移除了默认 Sharp 分发。** 官方 `@img/sharp-libvips-*` tarball 的
   README 列出 LGPL 组件并链接 AOM Patent License，但 tarball 没有 GNU GPLv3、
   LGPLv3 或 AOM `PATENTS` 全文。Windows 合并包只额外带 Sharp 的 Apache-2.0
   `LICENSE`。工作树保留 AOM 全文和上游第三方 notice 供 opt-in 用户查阅；默认
   安装闭包不再包含 Sharp。两条安装路径仍须经过一次公开 RC 验证。
5. **LGPL 的替换/重链接路径需要按真实二进制确认。** sharp-libvips 的 POSIX 构建把
   多个 LGPL 依赖静态构建进最终共享库，并把 `libvips.so` 静态链接进外层
   `libvips-cpp` 共享库。因此不能只凭“共享库”或“独立 npm 包”断言 LGPLv3 §4(d)(1)
   已满足；若不采用该路径，则要评估 §4(d)(0) 的 Minimal Corresponding Source 与
   Corresponding Application Code。
6. **AOM 专利许可要求的是 reproduce/include，不只是指向网页。** AOM Patent
   License §1.2.1 对二进制分发要求把许可包含在随附文档、法律通知或其他书面材料中，
   同时要求 Licensee 使自己的 Necessary Claims 按同一许可可用；§1.3 还有即时防御性
   终止条款。已发布的上游/项目 tarball 只有超链接；工作树中的文本复制修复尚待发布，
   且接受主体仍需明确。
7. **WASM 不在本次 HOLD 的原生许可面内。** 当前 `@imagemin-rs/wasm` 没有 Sharp、
   Gifsicle 或 pngquant 依赖，也不分发 sidecar；本结论只适用于当前依赖图。

## 当前实际分发结构

### `imagemin-rs` 与 GPL sidecar

仓库当前不是把四个 CLI 塞进一个平台包，而是按许可证族拆分：

| npm 包族                          | 数量 | 内容                      | 当前 metadata          |
| --------------------------------- | ---: | ------------------------- | ---------------------- |
| `@imagemin-rs/sidecars-*`         |    8 | cwebp、cjpeg、jpegtran    | permissive/IJG/Zlib 族 |
| `@imagemin-rs/sidecar-gifsicle-*` |    8 | Gifsicle 1.96 executable  | `GPL-2.0-only`         |
| `@imagemin-rs/sidecar-pngquant-*` |    8 | pngquant 3.0.3 executable | `GPL-3.0-or-later`     |

事实证据：

- [`packages/imagemin/package.json`](../../packages/imagemin/package.json) 把 24 个平台包
  列为 `optionalDependencies`，Sharp 0.35.3 则是精确、可选的 peer dependency。
- [`packages/imagemin/src/sidecar.ts`](../../packages/imagemin/src/sidecar.ts) 只解析当前
  平台的 npm 包路径；Gifsicle/pngquant 以独立进程运行，没有链接进 MIT N-API addon。
- [`tasks/sidecars/assemble-packages.mjs`](../../tasks/sidecars/assemble-packages.mjs)
  要求每个 GPL 包包含 executable、provenance manifest、上游完整许可文件、对应源码
  与构建材料。
- [`tasks/release/pack-packages.mjs`](../../tasks/release/pack-packages.mjs) 验证最终 tarball
  文件白名单，并逐项核对包内 source manifest、摘要与字节数。
- [`tasks/release/prepare-gpl-sources.mjs`](../../tasks/release/prepare-gpl-sources.mjs)
  生成精确 Gifsicle、pngquant、libimagequant、45 个 Cargo registry 源码、构建脚本、
  pins、Cargo lockfile 与 SHA-256 manifest；同一材料进入 npm tarball 与 GitHub
  Release 备份。
- [`ADR 0009`](../../internal-docs/adr/0009-sidecar-distribution.md) 把这种结构称为聚合；
  GPLv2 §2 和 GPLv3 §5 确有 mere aggregation/aggregate 条文，但当前 npm
  optional-dependency 图和进程协议是否属于这些条文的法律定性，仍是签署项。

平台包内许可文件本身是完整的：

- Gifsicle 包复制固定 tag 的
  [`COPYING`](https://github.com/kohler/gifsicle/blob/v1.96/COPYING)；
- pngquant 包复制固定 tag 的
  [`COPYRIGHT`](https://github.com/kornelski/pngquant/blob/3.0.3/COPYRIGHT)；
- libimagequant 包复制固定提交的
  [`COPYRIGHT`](https://github.com/ImageOptim/libimagequant/blob/6e9805761851f1a8320380b9f563961f892ec6ba/COPYRIGHT)。

后两份 `COPYRIGHT` 不只是通用 GPLv3 文本，还包含历史代码 copyright notice，因此不应
被一份通用 GPLv3 文件替换。

### 已公开 RC 的版本配对

截至核查日期，registry 与 GitHub Release 的可观察状态如下：

| 版本         | npm GPL sidecar                                                                                                                                                                                                                                                                                                                   | 项目控制的 GitHub Release 源码资产                                                                                | 事实结论                          |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `0.1.0-rc.5` | 已发布                                                                                                                                                                                                                                                                                                                            | 未建立当前源码资产流程                                                                                            | 没有项目控制的匹配资产证据        |
| `0.1.0-rc.6` | 已发布；代表性 [Gifsicle tarball](https://registry.npmjs.org/@imagemin-rs/sidecar-gifsicle-darwin-arm64/-/sidecar-gifsicle-darwin-arm64-0.1.0-rc.6.tgz) 与 [pngquant tarball](https://registry.npmjs.org/@imagemin-rs/sidecar-pngquant-darwin-arm64/-/sidecar-pngquant-darwin-arm64-0.1.0-rc.6.tgz) 含二进制、manifest 和许可文件 | [Release](https://github.com/ntnyq/imagemin-rs/releases/tag/v0.1.0-rc.6) 无 assets                                | 二进制与项目控制源码资产未配对    |
| `0.1.0-rc.7` | registry 没有匹配的 GPL sidecar；`imagemin-rs@rc.7` 的 optional dependencies 仍指向这些版本                                                                                                                                                                                                                                       | [Release](https://github.com/ntnyq/imagemin-rs/releases/tag/v0.1.0-rc.7) 有三个源码归档、manifest 和 build README | 有源码、没有同版本 npm GPL 二进制 |

`rc.6` sidecar provenance manifest 记录精确上游 URL 与 SHA-256，这提供来源可追踪性；
但“上游当前仍可下载”与“项目控制并持续提供匹配源码”是两个不同事实。下一次完整 RC
需要同时发布 npm 二进制和同版本源码资产，并保存可用性证据。

### Sharp / sharp-libvips

Sharp 不在 `imagemin-rs` tarball 内复制，而是
[`packages/imagemin/package.json`](../../packages/imagemin/package.json) 的可选 peer；
AVIF adapter 在独立 Node 子进程中加载它，见
[`packages/imagemin/src/avif.ts`](../../packages/imagemin/src/avif.ts)。安装 Sharp 时，
包管理器再根据平台选择官方 `@img/sharp-*` 和 `@img/sharp-libvips-*` 可选包。

上游制品边界如下：

- Sharp 自身使用 Apache-2.0，见
  [`sharp@0.35.3 LICENSE`](https://github.com/lovell/sharp/blob/v0.35.3/LICENSE) 和
  [`package.json`](https://github.com/lovell/sharp/blob/v0.35.3/package.json)。
- sharp-libvips 的打包仓库自身 `LICENSE` 是 Apache-2.0，但其 README 明确预编译共享库
  受所含第三方库许可证约束，见
  [`sharp-libvips@1.3.2 README`](https://github.com/lovell/sharp-libvips/blob/v1.3.2/README.md#L51-L57)
  与 [`LICENSE`](https://github.com/lovell/sharp-libvips/blob/v1.3.2/LICENSE)。
- 官方
  [`THIRD-PARTY-NOTICES.md`](https://github.com/lovell/sharp-libvips/blob/v1.3.2/THIRD-PARTY-NOTICES.md#L8-L39)
  把 fribidi、glib、libexif、libheif、librsvg、libvips、pango 和 proxy-libintl 列为
  LGPLv3，并说明这是利用其 LGPLv2/2.1 “any later version”条款；AOM 列为
  BSD-2-Clause 加 AOM Patent License 1.0。
- Darwin/Linux 的 `@img/sharp-libvips-*` metadata 是 `LGPL-3.0-or-later`；Windows
  合并 `@img/sharp-win32-*` metadata 是 `Apache-2.0 AND LGPL-3.0-or-later`。
- 官方打包脚本把 `THIRD-PARTY-NOTICES.md` 内容复制进每个平台 README，然后从非 dev
  包删除独立 notice，见
  [`populate-npm-workspace.sh`](https://github.com/lovell/sharp-libvips/blob/v1.3.2/populate-npm-workspace.sh#L34-L39)
  和其[删除步骤](https://github.com/lovell/sharp-libvips/blob/v1.3.2/populate-npm-workspace.sh#L65-L70)。
- 代表性的官方
  [`@img/sharp-libvips-linux-x64@1.3.2` tarball](https://registry.npmjs.org/@img/sharp-libvips-linux-x64/-/sharp-libvips-linux-x64-1.3.2.tgz)
  只有共享库、`glibconfig.h`、loader、`package.json`、`versions.json` 和 README；
  没有 GPLv3、LGPLv3、AOM `PATENTS` 或独立第三方 notice 全文。
- Windows 合并包带一份 Apache-2.0 `LICENSE`，但其 README 中的 LGPL/AOM 仍是摘要和
  链接；代表性制品为
  [`@img/sharp-win32-x64@0.35.3` tarball](https://registry.npmjs.org/@img/sharp-win32-x64/-/sharp-win32-x64-0.35.3.tgz)。

仓库的
[`packages/imagemin/THIRD_PARTY_NOTICES.md`](../../packages/imagemin/THIRD_PARTY_NOTICES.md)
正确记录了 Sharp、LGPL 组件和 AOM 的存在。当前工作树进一步新增
[`aom-LICENSE`](../../packages/imagemin/licenses/aom-LICENSE)、
[`aom-PATENTS`](../../packages/imagemin/licenses/aom-PATENTS) 和
[`sharp-libvips-THIRD-PARTY-NOTICES.md`](../../packages/imagemin/licenses/sharp-libvips-THIRD-PARTY-NOTICES.md)，
并把 `licenses` 加入 npm 文件白名单；GNU GPLv3/LGPLv3 全文仍未加入。
这些变化尚未出现在已发布 tarball。`imagemin-rs` 是通过 dependency metadata
引导用户取得上游独立 tarball，而不是把它们复制进自己的 tarball；这种角色是否构成
相关许可证下的 convey/distribute，应由律师按实际发布、镜像、bundle 和企业缓存方式
确认。

### WASM

[`wasm/imagemin/package.json`](../../wasm/imagemin/package.json) 的发布白名单只有
`dist`、MIT `LICENSE` 和 README，且没有 runtime/optional dependencies；
[`wasm/imagemin-core/src/lib.rs`](../../wasm/imagemin-core/src/lib.rs) 还明确测试
sidecar 不属于 WASM registry。当前 WASM 产物不包含：

- Gifsicle executable；
- pngquant/libimagequant sidecar；
- Sharp、libvips 或 libaom。

因此本文 GPL sidecar、Sharp LGPL 和 AOM patent HOLD 不应被扩展到当前 WASM tarball。
若以后给 WASM 增加这些 codec，必须按新的实际链接和分发结构重新审计。

## GPLv2：Gifsicle 1.96

### 上游许可身份

Gifsicle
[`v1.96 README`](https://github.com/kohler/gifsicle/blob/v1.96/README.md#copyrightlicense)
明确写 GNU GPL Version 2 only；固定 tag 的
[`COPYING`](https://github.com/kohler/gifsicle/blob/v1.96/COPYING) 是完整 GPLv2。
README 还列出一个替代许可，但对源代码不向最终用户开放、会违反 GPL 的上下文要求
联系作者取得许可。当前平台包 metadata 与随包文本选择的是 `GPL-2.0-only`，仓库没有
单独授权证据，因此本模型按 GPLv2 路径核查。

### 对应源码范围

[GNU GPLv2 §3](https://www.gnu.org/licenses/old-licenses/gpl-2.0.en.html#section3)
把 executable 的完整对应源码描述为：

- executable 所含全部模块的源代码；
- 相关 interface definition files；
- 控制编译与安装的脚本；
- 可排除通常随操作系统主要组件分发的内容，但若该组件随 executable 一起交付则例外。

当前 Gifsicle 事实包有：

- 精确 `gifsicle-1.96.tar.gz` 与 SHA-256；
- POSIX 构建脚本
  [`build-gifsicle.sh`](../../tasks/sidecars/build-gifsicle.sh)；
- Windows 使用的项目构建定义
  [`gifsicle-msvc/CMakeLists.txt`](../../tasks/sidecars/gifsicle-msvc/CMakeLists.txt)；
- target、flags、binary digest 和许可文本。

没有上游源码补丁；Windows CMake 文件是生成该平台 executable 所需的项目侧构建材料，
所以它必须继续与对应源码一起可取得。

### GPLv2 §3 的可选交付方式

| 选项    | 许可证文本事实                                                                | 与当前网络分发的关系                                                                            |
| ------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| §3(a)   | executable 随附完整、机器可读的对应源码                                       | 把源码直接放进各平台 npm tarball 是最直接的工程映射                                             |
| §3(b)   | executable 随附书面 offer；至少三年；向任何第三方；费用不高于实际物理交付成本 | 当前 README 只描述 GitHub Release 资产，没有明确 offer、期限、请求渠道或责任主体                |
| §3(c)   | 传递自己收到的 §3(b) offer                                                    | 仅限偶发、非商业分发，且上游二进制本来就是按 §3(b) offer 取得；不符合本仓库自建二进制事实       |
| §3 末段 | 若 executable 从指定地点提供下载，从同一地点提供等价源码访问可视为源码分发    | 当前 executable 在 npm、源码在 GitHub Release；两个下载地点是否满足该文本不能由工程审计自行确认 |

这里的“三年”只直接出现在 §3(b) 书面 offer。若选择 §3(a)/网络同地点交付，保留策略
仍需要保证接收二进制者实际能取得匹配源码，但不能把不同条款的期限混写。

### 聚合边界

[GPLv2 §2](https://www.gnu.org/licenses/old-licenses/gpl-2.0.en.html#section2) 说明 mere
aggregation 不会使另一独立作品落入 GPL，但也规定当同一整体是基于 GPL Program 的
作品时整体适用 GPL。当前有利于“独立作品”判断的工程事实是独立 npm 包、独立
executable、stdin/stdout 子进程协议和无链接；这不是法律定性的充分证明。

**待签署：** 选择 GPLv2 §3 的具体交付方式；确认 npm 与 GitHub 两个下载面是否接受；
确认至少三年的书面 offer 是否需要；确认 Gifsicle sidecar 与 MIT adapter 的聚合定性。

## GPLv3：pngquant 3.0.3 与固定 libimagequant

### 上游许可身份

- [`pngquant 3.0.3 README`](https://github.com/kornelski/pngquant/blob/3.0.3/README.md#license)
  与 [`COPYRIGHT`](https://github.com/kornelski/pngquant/blob/3.0.3/COPYRIGHT)：
  GPLv3-or-later 或另行商业许可；
- [固定 libimagequant README](https://github.com/ImageOptim/libimagequant/blob/6e9805761851f1a8320380b9f563961f892ec6ba/README.md#license)
  与 [`COPYRIGHT`](https://github.com/ImageOptim/libimagequant/blob/6e9805761851f1a8320380b9f563961f892ec6ba/COPYRIGHT)：
  GPLv3-or-later 或另行商业许可。

仓库没有商业许可证据，平台包明确声明 `GPL-3.0-or-later`。Sharp 内部的
`lovell/libimagequant` 是 BSD-2-Clause 分支，见 sharp-libvips 第三方清单；它不是这里
固定的 ImageOptim/libimagequant，不能混用许可结论。

### Corresponding Source 范围

[GNU GPLv3 §1](https://www.gnu.org/licenses/gpl-3.0.en.html#section1) 将 Corresponding
Source 定义为生成、安装、运行和修改 object code 所需的全部源码及控制这些活动的
脚本；System Libraries、未修改且不属于作品的通用工具可排除。

当前构建过程见
[`build-pngquant.sh`](../../tasks/sidecars/build-pngquant.sh)：

1. 解压精确 pngquant 源码；
2. 解压精确 libimagequant 提交到其 `lib/`；
3. 用仓库的
   [`pngquant.Cargo.lock`](../../tasks/sidecars/pngquant.Cargo.lock) 覆盖上游 lockfile；
4. 按平台执行 `cargo build` / `cargo zigbuild`，使用
   `--no-default-features --features static,z-static`；
5. strip 并打包 executable。

`v0.1.0-rc.7` Release 已保存前两项的源码归档，tag 保存第 3、4 项材料。尚未证明的
边界是：

- `Cargo.lock` 解析的 crates.io 依赖中，哪些实际进入各平台 executable；
- 其中静态链接模块的源码是否应进入 Corresponding Source；
- 只保留 checksum 和 registry 坐标、未保存 crate 源码，是否足以满足最终选择的
  交付方式；
- Rust/Zig/C toolchain 中哪些属于 §1 的 System Library 或未修改通用工具；
- 所有 target-specific 依赖、build script、配置和安装信息是否已覆盖。

这些问题需要用每个平台的实际 Cargo build graph、link map/SBOM 和最终二进制回答，
不能只用整份 lockfile 或“可以重新下载依赖”代替范围证明。

### GPLv3 §6 的可选交付方式

[GNU GPLv3 §6](https://www.gnu.org/licenses/gpl-3.0.en.html#section6) 对 object code 列出：

| 选项  | 许可证文本事实                                                                     | 对当前 npm 模型的适用性事实                 |
| ----- | ---------------------------------------------------------------------------------- | ------------------------------------------- |
| §6(a) | 物理产品/介质随附持久物理介质上的 Corresponding Source                             | 当前不是物理分发                            |
| §6(b) | 物理产品/介质随附书面 offer；至少三年，且不短于该型号备件/客户支持期限             | 当前 npm 网络下载不是该条描述的物理产品路径 |
| §6(c) | 偶发、非商业地传递自己收到的 §6(b) offer                                           | 不符合自建并持续公开发布 sidecar 的事实     |
| §6(d) | 从指定地点提供 object code 时，以同样方式、无额外费用提供等价 Corresponding Source | 最接近当前网络分发模型                      |
| §6(e) | peer-to-peer 传输，并告知 peers object/source 的公开免费位置                       | 当前不是 P2P                                |

GPLv3 §6(d) 允许 Corresponding Source 位于另一台支持等价复制设施的服务器，但要求在
object code 旁保持清楚指引，并由分发者保证源码在所需期间可用。与 GPLv2 §3 末段
相比，这是需要分开记录的重要差异。

当前 `rc.7` 平台包 README 模板已有“matching `imagemin-rs` GitHub Release”的指引，
但匹配平台包尚未发布；已发布的 `rc.6` README 没有该指引，且 `rc.6` Release 无资产。

若 object code 用于 GPLv3 所定义的 User Product，§6 还可能要求 Installation
Information；普通 npm CLI 是否落入该定义不是本文可作出的结论。

### 聚合边界

[GPLv3 §5](https://www.gnu.org/licenses/gpl-3.0.en.html#section5) 定义 aggregate：分开的
独立作品未组合成更大的程序时，把它们放在同一存储/分发介质上不会使其他部分适用 GPL。
当前独立 package/process 是相关事实，但是否构成 aggregate、optional dependency
默认安装是否改变定性，仍须法律确认。

**待签署：** 选择 §6(d) 或把完整源码直接放入 npm tarball；确认跨服务器指引和保留
策略；按平台确定 Corresponding Source 清单；确认与 MIT adapter 的 aggregate 定性。

## LGPLv3：Sharp 预编译运行时

### 条文边界

[GNU LGPLv3 §0](https://www.gnu.org/licenses/lgpl-3.0.en.html#section0) 区分：

- **Application**：使用 Library 接口、但不是基于 Library 的作品；
- **Combined Work**：Application 与 Library 组合或链接后的作品；
- **Minimal Corresponding Source**：Combined Work 的 Corresponding Source，排除孤立
  看属于 Application 而非 Linked Version 的部分；
- **Corresponding Application Code**：重建 Combined Work 所需的 Application
  object/source、数据和 utilities。

[LGPLv3 §4](https://www.gnu.org/licenses/lgpl-3.0.en.html#section4) 对 Combined Work 的
核心事实要求包括：

1. 整体条款不得有效限制修改其中 Library 部分，也不得限制为调试这些修改而进行的
   reverse engineering；
2. 每份副本显著说明使用了 Library 且 Library/其使用受 LGPL 覆盖；
3. 随附 GNU GPL 与 LGPL 两份许可文本；
4. 若运行时显示 copyright notices，加入 Library notice 和查看许可文本的指引；
5. 在以下两条中选择一条：
   - §4(d)(0)：提供 Minimal Corresponding Source 以及允许重新组合/重链接的
     Corresponding Application Code；
   - §4(d)(1)：使用合适的 shared library mechanism，即运行时使用用户系统中已有的
     Library 副本，并能与接口兼容的修改版正常工作；
6. 若 GPLv3 §6 本来要求 Installation Information，则按所选 §4(d) 路径提供。

[LGPLv3 §3](https://www.gnu.org/licenses/lgpl-3.0.en.html#section3) 还覆盖从 Library header
取得材料的 application object code；[§5](https://www.gnu.org/licenses/lgpl-3.0.en.html#section5)
覆盖把 Library facilities 与非 LGPL facilities 并排放入单一 combined library 的情形。

### 真实链接结构

sharp-libvips 不是“所有 LGPL 组件各自一个可替换动态库”的结构。上游
[`build/posix.sh`](https://github.com/lovell/sharp-libvips/blob/v1.3.2/build/posix.sh#L119-L166)
把 glib、libexif 等依赖构建为 static；
[`fribidi/pango` 构建段](https://github.com/lovell/sharp-libvips/blob/v1.3.2/build/posix.sh#L315-L329)
也采用 static；最终
[`libvips link 段`](https://github.com/lovell/sharp-libvips/blob/v1.3.2/build/posix.sh#L368-L388)
把 `libvips.so` 静态链接进只在外层导出的 `libvips-cpp` shared library。

Sharp 官方文档允许安装时使用符合最低版本的自定义全局 libvips，并提供
`SHARP_FORCE_GLOBAL_LIBVIPS`，见
[`Custom libvips`](https://sharp.pixelplumbing.com/install/#custom-libvips)；同一文档说明
Windows 和 macOS Rosetta 有不支持范围。该能力是替换路径的相关证据，但不能单独证明：

- 预编译 addon 在八个平台都能直接使用修改版；
- 静态嵌入外层共享库的每个 LGPL 组件都可按 §4(d)(1) 替换；
- 重建/重链接需要的 exact sources、flags、Application Code 与安装步骤完整可得。

### 当前 notice/source/relink 证据

| 项目                      | 当前事实                                                      | 尚未证明                                                                                                        |
| ------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 显著 notice               | `@img` README 与 `imagemin-rs` 第三方 notice 均列出 LGPL 组件 | notice 放置是否覆盖每个被认定为 Combined Work 的副本                                                            |
| GPL/LGPL 文本             | 上游 README 只写许可名；`imagemin-rs` notice 只做摘要         | §4(b) 所述两份许可文本没有出现在实际平台 tarball                                                                |
| §4(d)(1) shared mechanism | 最外层是共享库；Sharp 支持部分平台使用自定义全局 libvips      | 八平台与内部静态 LGPL 组件的 interface-compatible replacement 证明                                              |
| §4(d)(0) relink materials | Sharp 源码公开，sharp-libvips build scripts 公开              | Minimal Corresponding Source、Corresponding Application Code、exact build inputs 是否按接收者可用的方式成套交付 |
| Source availability       | 上游仓库和版本清单可追踪                                      | 最终由谁保存哪些 LGPL 组件的精确源码、修改和构建配置                                                            |

是否由 `imagemin-rs` 发布者承担上述 convey 义务，取决于其只是声明外部依赖，还是还会
镜像、bundle、缓存或重新分发 Sharp 平台 tarball。该角色问题必须在最终发布模型中写明，
不能把上游包的 metadata 当作项目自身签署。

**待签署：** 确认 convey/distributor 主体；对每个平台选择 §4(d)(0) 或 §4(d)(1)；
确认静态 LGPL 组件的替换/重链接方案；确认 GPLv3+LGPLv3 全文的交付位置；确认 exact
source、修改、build inputs 和 Installation Information 的边界。

## AOM Patent License 1.0

### 上游许可事实

libaom 3.14.1 同时带：

- [BSD `LICENSE`](https://aomedia.googlesource.com/aom/+/refs/tags/v3.14.1/LICENSE)；
- [AOM `PATENTS`](https://aomedia.googlesource.com/aom/+/refs/tags/v3.14.1/PATENTS)，其内容与
  [AOMedia 官方 Patent License 1.0](https://aomedia.org/license/patent-license/) 一致。

Sharp 的官方第三方清单把 AOM 明确列为两者同时适用。仅保留 BSD 文件不能替代专利
许可文本。

### 交付与终止条款

| 条款      | 官方文本中的事实                                                                                                                                                       |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §1.1      | Licensor 直接授予 Licensee 非转许可、永久、全球、非独占、免费、免版税且除明示情况外不可撤销的 Necessary Claims 许可                                                    |
| §1.2.1    | 作为授权条件，Licensee 必须使自己的 Necessary Claims 按同一许可可用，并随任何 Implementation 重现本许可                                                                |
| §1.2.1(a) | 源码分发时，许可放在包含 Implementation 的源码根目录                                                                                                                   |
| §1.2.1(b) | 二进制/object 等形式分发时，许可包含在随附 documentation、legal notices 或其他 written materials                                                                       |
| §1.2.2    | 权利直接来自 Licensor；Licensee 不从 supplier/distributor 间接取得这些权利                                                                                             |
| §1.3      | Licensee、其 affiliates 或 agents 发起、提交、维持或自愿参与诉讼，主张任何 Implementation 侵犯 Necessary Claims 时，直接授予该 Licensee 的专利许可从行动发起日立即终止 |
| §1.3 例外 | 回应别人先就 Implementation 提起的对应诉讼，或为执行本许可而诉讼                                                                                                       |
| §2.6      | Implementation 是 Encoder/Decoder；组件只在作为该 Implementation 一部分使用的范围内计入                                                                                |

`sharp.versions.aom = 3.14.1` 且 AVIF 路径实际调用 AOM encoder/decoder。把这两个事实与
§2.6 合并，libaom runtime 落入 Implementation 是合理的工程推断；最终适用性仍由律师
确认。

### 已发布包装与工作树修复

代表性的 `@img` 平台 tarball：

- README 有“AOM = BSD 2-Clause + AOM Patent License 1.0”的表格和网页链接；
- tarball 没有 `PATENTS` 全文；
- 已发布的 `imagemin-rs` 第三方 notice 也只有名称和来源链接。

当前工作树已经把 libaom 3.14.1 的
[`LICENSE`](../../packages/imagemin/licenses/aom-LICENSE) 和
[`PATENTS`](../../packages/imagemin/licenses/aom-PATENTS) 原文复制进 public package，
同时保存 sharp-libvips 第三方 notice；pack/verifier 也会拒绝缺少这些文件的 tarball。
这是对文本交付事实的工程修复，但尚未经过公开 RC，且不替代发布主体对专利条件的接受。

许可证使用的是 reproduce/include，而已发布制品的可观察事实仍是 hyperlink。本文不
判断 hyperlink 在任何法域是否等同于重现；稳定版签署必须明确选择：

1. 哪个随二进制交付的文档/法律材料完整包含 AOM Patent License 1.0；
2. 发布主体以何种身份接受 Necessary Claims reciprocal condition；
3. 发布主体及 affiliates 是否接受并内部记录 §1.3 defensive termination；
4. 上游 Sharp 独立 tarball与 `imagemin-rs` 依赖分发分别由谁承担文本交付。

## HOLD 签署矩阵

以下每项都需要一个具名结论；“已读本文”不能代替选项和责任人。

| ID     | 必须签署的决定                                                 | 当前证据                                                                                    | 解除条件                                                                                     |
| ------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| GPL-1  | Gifsicle 采用 GPLv2 §3(a)、§3(b) 或网络同地点中的哪一路径      | 二进制 npm 包、精确源码、构建材料均可识别，但位于两个服务                                   | 律师确认路径；维护者记录交付位置、责任人和期限                                               |
| GPL-2  | pngquant/libimagequant 采用 GPLv3 §6(d) 还是 npm 随包源码      | `rc.7` 模板有跨服务器指引，但尚无匹配二进制                                                 | 完整 RC 实跑并证明 object/source 同版本、指引紧邻、无额外费用且持续可用                      |
| GPL-3  | Corresponding Source 精确清单                                  | 工作树已打包两个上游归档、build scripts、Cargo lock 和全部 45 个 registry 源码；尚无公开 RC | 新 RC 验证材料摘要；八平台 build graph/link map 形成清单，律师确认 System Library/工具排除项 |
| GPL-4  | MIT adapter 与 GPL executables 的 aggregate/独立作品定性       | 独立包、独立进程、无链接                                                                    | 律师按最终默认安装和 IPC 结构签署；ADR 不再把工程选择写成已证明法律结论                      |
| LGPL-1 | `imagemin-rs` 发布者是否是 Sharp 平台包的 conveyor/distributor | 根 tarball 只声明 dependency；用户安装会取得平台包                                          | 覆盖 npm、镜像、企业缓存、bundle 场景的角色结论                                              |
| LGPL-2 | 每个平台采用 §4(d)(0) 还是 §4(d)(1)                            | 外层 shared library + 内部多个 static LGPL 组件                                             | 八平台替换测试或成套 MCS/Application Code/relink 证据                                        |
| LGPL-3 | notice 和 GPLv3/LGPLv3 全文放置                                | 当前只有摘要和链接                                                                          | 最终 tarball/随附材料检查能定位两份完整文本                                                  |
| AOM-1  | AOM 专利文本交付位置                                           | 工作树已加入官方全文和 tarball 检查；已发布制品仍只有链接                                   | 新 RC 证明最终随附材料包含官方 v1.0 全文，验证器检查字节/摘要                                |
| AOM-2  | Necessary Claims 与 defensive termination 接受主体             | 官方条款已明确，仓库没有组织签署记录                                                        | 发布法律实体/个人维护者与律师具名接受或决定替代 codec                                        |
| OPS-1  | 源码资产不可变性和可用期限                                     | GitHub Release 可被删除/覆盖；当前 workflow 使用 `--clobber`                                | 确认保留政策、备份、监控、删除保护和每版本恢复演练                                           |
| OPS-2  | 公开版本闭环                                                   | `rc.6` 有二进制无资产；`rc.7` 有资产无 GPL 二进制                                           | 新 RC 同时发布全部平台包与对应源码，并从全新环境复核                                         |

## 可交给律师和发布负责人的最小证据包

这不是合规方案，而是避免签署时缺事实的材料清单：

1. 八个平台每个 GPL/Sharp tarball 的完整文件清单和 SHA-256；
2. 每个 GPL executable 的 source-to-binary manifest、实际 build graph 和 link map；
3. Gifsicle、pngquant、libimagequant、所有实际链接 crate 的 exact source archive；
4. 项目 build scripts、Cargo lockfile、target flags、toolchain 镜像 digest 和修改清单；
5. GPLv2 §3 与 GPLv3 §6 分开的交付路径说明及可用期限；
6. 每个平台 Sharp addon、外层 libvips shared library、内部静态 LGPL 组件的链接图；
7. §4(d)(1) 替换测试，或 §4(d)(0) 的 Minimal Corresponding Source、
   Corresponding Application Code 与 relink instructions；
8. GNU GPLv3、LGPLv3、AOM `PATENTS` 在最终制品中的确切路径；
9. 发布主体对 AOM reciprocal patent condition 和 defensive termination 的签署；
10. 一份实际安装后的审计：从 npm 取得的版本、文件、许可文本、源码链接全部与 tag
    和 Release asset 对应。

在这些决定被具名签署并用一次完整 RC 验证前，
[`stable-release-audit.md`](../../internal-docs/stable-release-audit.md) 的许可证 HOLD
应保持不变。
