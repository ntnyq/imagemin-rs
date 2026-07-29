# imagemin-rs 发布手册

更新日期：2026-07-29

当前 P2 发布单元由 35 个同版本 npm 包组成：`imagemin-rs`、`@imagemin-rs/binding`、
`@imagemin-rs/wasm`、
8 个 `@imagemin-rs/binding-*` 平台包、8 个同时携带 cwebp、cjpeg、jpegtran 的
`@imagemin-rs/sidecars-*` 平台包，以及 8 个 GPL `@imagemin-rs/sidecar-pngquant-*`
和 8 个 GPL `@imagemin-rs/sidecar-gifsicle-*` 平台包。任何一个包都不能单独版本
漂移。`0.0.0` 只表示未发布开发状态，发布脚本会拒绝它。

## 安全模型

- tag 只触发构建、汇总、tarball 校验和 8 平台安装冒烟，不自动公开包；
- 后续版本通过 GitHub Actions 的 npm trusted publishing/OIDC 直接发布；
- `npm` GitHub environment 应启用 maintainer 审批，作为发布前唯一一次人工门禁；
- trusted publisher 只允许 `npm publish`，不允许 `npm stage publish`；
- environment 获批后，35 个包按依赖顺序直接公开，不再逐包执行 npm 2FA 审批；
- release runner 不使用依赖缓存，发布 tarball 带 npm 自动 provenance；
- release tag 不移动。失败后修复代码并发布新 patch/pre-release，不能覆写已有版本。

npm 的当前要求是 Node.js 22.14+、npm 11.5.1+ 才能使用 trusted publishing。工作流
固定 Node 24.16.0，并在 publish job 固定 npm 12.0.1。
依据：[trusted publishing](https://docs.npmjs.com/trusted-publishers/)、
[provenance](https://docs.npmjs.com/generating-provenance-statements/)。

## 准备一个版本

1. 确认产品完成度审计中没有计划发布范围内的阻断项。
2. 在发布分支运行 `pnpm run release:version -- 0.x.y`。脚本同时更新 npm/Cargo 包、
   `Cargo.lock` 和生成的 binding loader 版本。
3. 审查版本 diff，更新 changelog、迁移说明、benchmark 和第三方许可证清单。
4. 运行：

   ```sh
   pnpm install --frozen-lockfile
   pnpm run check
   pnpm run build
   pnpm run audit
   pnpm run release:verify
   pnpm run release:bundle:current
   pnpm run release:smoke
   ```

5. 提交并推送已验证 commit，再创建不可变 tag `v0.x.y`。tag 必须和所有 manifest 的
   `0.x.y` 一致。
6. 等待 `Release` workflow 的 RustSec/npm dependency audit、8 个 binding、
   8 个 BSD sidecar、8 个 MozJPEG、8 个 pngquant、8 个 Gifsicle 构建，以及 35 包
   汇总和 8 平台全 codec tarball smoke 全部通过。下载并保存
   `release-packages` artifact；其中的
   `release-manifest.json` 含每个 tarball 的 SHA-512 integrity，
   `release-sbom.cdx.json` 含发布 tarball 和固定 sidecar 源码，
   `release-dependencies.cdx.json` 含 Rust 与生产 npm 依赖闭包。每个 smoke job 另上传
   `smoke-<platform>` artifact。smoke 先证明默认 closure 未安装 Sharp、非 AVIF codec
   正常且 AVIF 返回可操作错误，再显式安装 `sharp@0.35.3` 运行全部 codec 并生成该
   平台 Sharp SBOM。
   tag 对应的 GitHub Release 还必须包含经 pins 的 SHA-256 验证过的 Gifsicle、
   pngquant 和 libimagequant 源码压缩包、覆盖 pngquant lockfile 全部 45 个 registry
   包的 `pngquant-cargo-sources.tar`、`sidecar-build-scripts.tar`、
   `gpl-source-manifest.json` 以及 `GPL-SOURCE-README.md`，并上传与版本同步的
   OpenVEX。两个 tar 由发布脚本按固定路径、mode、uid/gid 和 mtime 确定性生成；
   同一份 Gifsicle/pngquant 对应源码与构建材料还必须进入每个 GPL 平台 npm tarball，
   由 source manifest、pack verifier 和安装回读核对。release audit 还会从 AOM
   官方 tag 历史断言批准的修复 commit。

本地 `release:bundle:current` 只证明当前 OS/CPU。不能用它替代 GitHub workflow 的 8
平台门禁。

## 发布清单范围

`pack-packages.mjs` 每次打包都会生成确定性的 `release-sbom.cdx.json`：

- `current` bundle 记录当前平台 7 个 tarball；完整 release bundle 记录全部 35 个；
- npm tarball 使用 SHA-512，固定 sidecar 源码使用 SHA-256，并记录版本与下载地址；
- 相同 manifest 和 pins 生成相同内容及 serial number；输入摘要格式异常会终止打包。

同时生成的 `release-dependencies.cdx.json` 记录：

- 从 `imagemin_napi` 与 `imagemin_wasm_core` 可达的非 dev Cargo graph，含 workspace
  crate、registry checksum、license expression 与依赖边；
- `imagemin-rs` 的默认生产 npm graph；L2 下该 graph 不含 Sharp。显式 AVIF smoke
  另外记录 Sharp 平台 optional packages、版本、下载地址、许可证和仓库；
- Rust 与 npm 组件数量由当前锁文件计算；依赖变化时随锁文件更新。

两份文件均为确定性 CycloneDX 1.6 JSON，本地已通过官方 1.6 JSON Schema 和引用闭合
校验。8 个平台 smoke 会从全新安装中读取 `sharp.versions`，记录实际 `@img/sharp-*`
平台包、内嵌原生库版本，以及 `.node`/共享库文件的 SHA-256 和大小。
`v0.1.0-rc.6` 的 8 个目标均已上传对应 smoke artifact；完整 release bundle、依赖审计
和 npm stage job 也已通过。CI 和 release 均会拒绝 RustSec advisory、Cargo
许可证/来源违规和 npm production high/critical advisory。固定 sidecar 与 Sharp 内嵌
C 库已完成发布时点审计：MozJPEG/libxml2 的构建面结论由 OpenVEX 和 smoke 断言覆盖，
AOM 的指定修复由官方 tag 历史和运行时版本双重断言。数据库与上游公告仍可能变化，
因此每个稳定候选都要重新复核最终 SBOM。第三方许可证正文仍以各 tarball 和
`THIRD_PARTY_NOTICES.md` 为准。

## 本地演练记录

2026-07-29 在 macOS ARM64 上完成一次不触及 registry 的 RC rehearsal：

- frozen install、format、lint、typecheck、Rust/binding/public package 测试、文档构建、
  release build、RustSec/Cargo policy 与 npm production audit 均通过；
- metadata 校验覆盖 35 个 package manifest；当前平台校验覆盖 binding、3 个 BSD
  executable、pngquant 与 Gifsicle 共 6 个 binary artifact，并单独校验 WASM bundle；
- 7 个当前平台 tarball 通过文件白名单与 SHA-512 bundle；Node 包通过全新 npm 安装和
  11 个 codec 的真实输入 smoke，WASM 包通过三浏览器 PNG/GIF/SVG smoke；
- bundle 同时生成 CycloneDX 1.6 清单，覆盖 7 个 tarball 与 9 个固定 sidecar 源码；
- 依赖清单覆盖 N-API 与 WASM 的非 dev Rust closure，以及生产 npm/Sharp 平台包组件；
- 当前平台 smoke 另生成 32 组件的 Sharp runtime SBOM，2 个原生文件均有 SHA-256；
- 首轮并行 public package 测试出现一次 Vitest fork worker 启动超时；失败文件隔离重跑
  和随后完整 207 项测试均通过；在这次本地演练结束时，完整 8 平台 CI 仍需提供
  无抖动证据。

这次本地演练当时不覆盖其余 7 平台的 Sharp/libvips 清单、完整 35 包 bundle、
sidecar/Sharp 原生依赖的发布日 CVE 审计、npm provenance 或 GPL 法律确认。

## 跨平台 RC 记录

2026-07-29 的
[`v0.1.0-rc.6` Release workflow](https://github.com/ntnyq/imagemin-rs/actions/runs/30428078178)
完成：

- 8 个 binding target 与 cwebp、MozJPEG、pngquant、Gifsicle 的完整构建矩阵；
- 34 包 release bundle、SHA-512、CycloneDX 和依赖审计；
- macOS、Windows、Linux GNU/musl 的 x64/arm64 全新安装及 11 codec smoke；
- 每个平台的 Sharp/libvips runtime SBOM 与原生文件摘要；
- OIDC npm staged publishing；registry 中的 `0.1.0-rc.6` 公开包带 SLSA provenance。

这次运行关闭了“其余 7 平台、完整 34 包演练、首次公开包和真实 provenance”缺口。
`0.1.0-rc.7` 起，tag workflow 会把 Gifsicle、pngquant 与 libimagequant 的精确源码
输入及校验清单附加到对应 GitHub Release。2026-07-30 的分发决定进一步要求每个 GPL
平台 npm tarball 随包携带完整固定源码与构建材料，GitHub Release 作为备份。最低系统
版本已固定为 macOS 11、Linux glibc 2.28/musl 1.1.19 与 Windows 10/Server 2016，
并由公开平台政策和 package contract 覆盖。

## 首次发布引导

npm 不允许 brand-new package 使用 staged publishing，而且 package 尚不存在时也无法给它
配置 trusted publisher。原有 34 个包的首次引导已经完成；新增的
`@imagemin-rs/wasm` 必须先由 maintainer 对校验后的 tarball 完成一次带 2FA 的公开发布，
再为它配置与其余包相同的 trusted publisher。完成这个一次性步骤前，不得启动 35 包
direct release，以免形成部分发布。

引导完成后，日常发布必须从受保护的 GitHub environment 运行：

```sh
node tasks/release/publish-packages.mjs \
  --mode=publish \
  --bundle=/absolute/path/to/release-packages
```

脚本先验证 bundle integrity，再按“8 binding 平台包 → 8 BSD sidecar 平台包 →
8 pngquant sidecar 平台包 → 8 Gifsicle sidecar 平台包 → WASM → binding → public
package”的顺序发布。不要在 CI 中保存长期 npm token。若中途失败，不要重新打包、
重用版本或移动 tag；核对 registry 后发布新的 patch/pre-release。

WASM 首次版本可见后，为全部 35 个包确认：

- GitHub owner：`ntnyq`
- repository：`imagemin-rs`
- workflow filename：`release.yml`
- environment：`npm`
- allowed action：仅 `npm publish`

`v0.1.0-rc.6` 已验证一次 staged release 和真实 npm provenance。切换 direct publish
后，全部 35 个包的 trusted publisher 都必须同步允许 `npm publish`；仓库配置不能替代
该账户侧检查。

## 后续 direct release

在 GitHub Actions 手动运行 `Release`，ref 选择已通过的 tag，`action` 选择 `publish`。
工作流会重新构建和 smoke，而不是信任旧 artifact；进入 `publish-npm` job 后先等待
`npm` environment 的 maintainer 审批，再以 OIDC 直接公开 35 个 tarball。

预发布版本固定使用 `next` dist-tag，稳定版本使用 `latest`。发布候选期的安装文档必须
显式写成 `pnpm add imagemin-rs@next`，避免无 tag 安装落到旧的 `latest`。

批准 environment 前核对：package name/version、SHA-512、文件列表、依赖版本、tag 和
workflow run。发布脚本先发 binding/sidecar 平台包，再发 binding，最后发
`imagemin-rs`，以减少消费者看到依赖尚未可用版本的窗口。

`v0.1.0-rc.7` 在切换前已经进入 npm staging area；该版本仍须按旧流程逐包批准。npm
已经保留这些版本号，不能改用 direct publish 覆盖。direct publish 从下一个版本生效。

## 失败与回滚

- 构建、校验或 smoke 失败：不发布；修复后发新 tag。
- environment 批准前发现内容不符：停止 workflow，修复后发布新版本。
- direct publish 部分成功：弃用已公开的部分版本，并发布新的 patch/pre-release；
  不重新打包或复用同一版本。
- 已公开版本有问题：立即移动 `latest`/`next` 到最后一个健康版本并 `npm deprecate` 问题
  版本；除非满足 npm unpublish policy 且确认没有消费者，否则不 unpublish。
- 任何情况下都不重用 npm version，不移动已推送 release tag。

发布完成的定义不是 workflow 变绿，而是 tag、GitHub artifact、35 个 npm package、dist-tag、
provenance 和安装后全 codec smoke 对同一版本一致。
