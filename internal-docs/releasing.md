# imagemin-rs 发布手册

更新日期：2026-07-29

当前 P2 发布单元由 34 个同版本 npm 包组成：`imagemin-rs`、`@imagemin-rs/binding`、
8 个 `@imagemin-rs/binding-*` 平台包、8 个同时携带 cwebp、cjpeg、jpegtran 的
`@imagemin-rs/sidecars-*` 平台包，以及 8 个 GPL `@imagemin-rs/sidecar-pngquant-*`
和 8 个 GPL `@imagemin-rs/sidecar-gifsicle-*` 平台包。任何一个包都不能单独版本
漂移。`0.0.0` 只表示未发布开发状态，发布脚本会拒绝它。

## 安全模型

- tag 只触发构建、汇总、tarball 校验和 8 平台安装冒烟，不自动公开包；
- 后续版本通过 GitHub Actions 的 npm trusted publishing/OIDC 提交 staged package；
- `npm` GitHub environment 应启用 maintainer 审批；
- trusted publisher 只允许 `npm stage publish`，不允许直接 `npm publish`；
- staged package 必须由 maintainer 检查后以 2FA 批准；
- release runner 不使用依赖缓存，发布 tarball 带 npm 自动 provenance；
- release tag 不移动。失败后修复代码并发布新 patch/pre-release，不能覆写已有版本。

npm 的当前要求是 Node.js 22.14+、npm 11.5.1+ 才能使用 trusted publishing；staged
publishing 要求 npm 11.15+。工作流固定 Node 24.16.0，并在 stage job 固定 npm 12.0.1。
依据：[trusted publishing](https://docs.npmjs.com/trusted-publishers/)、
[staged publishing](https://docs.npmjs.com/staged-publishing/)、
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
   8 个 BSD sidecar、8 个 MozJPEG、8 个 pngquant、8 个 Gifsicle 构建，以及 34 包
   汇总和 8 平台全 codec tarball smoke 全部通过。下载并保存
   `release-packages` artifact；其中的
   `release-manifest.json` 含每个 tarball 的 SHA-512 integrity，
   `release-sbom.cdx.json` 含发布 tarball 和固定 sidecar 源码，
   `release-dependencies.cdx.json` 含 Rust 与生产 npm 依赖闭包。每个 smoke job 另上传
   `smoke-<platform>` artifact，内含 codec 报告和该平台实际安装后的 Sharp SBOM。

本地 `release:bundle:current` 只证明当前 OS/CPU。不能用它替代 GitHub workflow 的 8
平台门禁。

## 发布清单范围

`pack-packages.mjs` 每次打包都会生成确定性的 `release-sbom.cdx.json`：

- `current` bundle 记录当前平台 6 个 tarball；完整 release bundle 记录全部 34 个；
- npm tarball 使用 SHA-512，固定 sidecar 源码使用 SHA-256，并记录版本与下载地址；
- 相同 manifest 和 pins 生成相同内容及 serial number；输入摘要格式异常会终止打包。

同时生成的 `release-dependencies.cdx.json` 记录：

- 从 `imagemin_napi` 可达的非 dev Cargo graph，含 workspace crate、registry checksum、
  license expression 与依赖边；
- `imagemin-rs` 的生产 npm graph，含 Sharp 的平台 optional packages、版本、下载地址，
  以及已安装 package manifest 提供的许可证和仓库；
- 当前锁文件下共 84 个 Rust 与 81 个 npm 组件；依赖变化时数量随锁文件更新。

两份文件均为确定性 CycloneDX 1.6 JSON，本地已通过官方 1.6 JSON Schema 和引用闭合
校验。8 个平台 smoke 还会从全新安装中读取 `sharp.versions`，记录实际 `@img/sharp-*`
平台包、内嵌原生库版本，以及 `.node`/共享库文件的 SHA-256 和大小。macOS ARM64
实测为 2 个平台包、28 个内嵌库组件和 2 个原生文件；其余平台等待 release workflow
证据。CI 和 release 均会拒绝 RustSec advisory、Cargo 许可证/来源违规和 npm production
high/critical advisory。该门禁不覆盖固定 sidecar 源码及 Sharp 内嵌 C 库，发布当日仍需
对最终 SBOM 执行原生依赖漏洞审计。第三方许可证正文仍以各 tarball 和
`THIRD_PARTY_NOTICES.md` 为准。

## 本地演练记录

2026-07-29 在 macOS ARM64 上完成一次不触及 registry 的 RC rehearsal：

- frozen install、format、lint、typecheck、Rust/binding/public package 测试、文档构建、
  release build、RustSec/Cargo policy 与 npm production audit 均通过；
- metadata 校验覆盖 34 个 package manifest，当前平台校验覆盖 binding、3 个 BSD
  executable、pngquant 与 Gifsicle 共 6 个 artifact；
- 6 个当前平台 tarball 通过文件白名单、SHA-512 bundle、全新 npm 安装和 11 个 codec
  的真实输入 smoke；
- bundle 同时生成 CycloneDX 1.6 清单，覆盖 6 个 tarball 与 9 个固定 sidecar 源码；
- 依赖清单覆盖 84 个非 dev Rust 与 81 个生产 npm/Sharp 平台包组件；
- 当前平台 smoke 另生成 32 组件的 Sharp runtime SBOM，2 个原生文件均有 SHA-256；
- 首轮并行 public package 测试出现一次 Vitest fork worker 启动超时；失败文件隔离重跑
  和随后完整 207 项测试均通过。完整 8 平台 CI 仍需提供无抖动证据。

这次演练不覆盖其余 7 平台的 Sharp/libvips 清单、完整 34 包 bundle、sidecar/Sharp
原生依赖的发布日 CVE 审计、npm provenance 或 GPL 法律确认。

## 首次发布引导

npm 不允许 brand-new package 使用 staged publishing，而且 package 尚不存在时也无法给它
配置 trusted publisher。因此当前 34 个包的首次版本必须由 maintainer 在 tag workflow 全通过后
用交互式 npm 登录和 2FA 引导一次：

```sh
node tasks/release/publish-packages.mjs \
  --mode=publish \
  --bootstrap \
  --bundle=/absolute/path/to/release-packages
```

脚本先验证 bundle integrity，再按“8 binding 平台包 → 8 BSD sidecar 平台包 →
8 pngquant sidecar 平台包 → 8 Gifsicle sidecar 平台包 → binding → public
package”的顺序发布。不要在 CI 中保存 bootstrap token。若中途失败，只继续补齐
同一已验证 bundle 中缺失的包；不要重新打包或移动 tag。

首次版本可见后，分别为全部 34 个包配置：

- GitHub owner：`ntnyq`
- repository：`imagemin-rs`
- workflow filename：`release.yml`
- environment：`npm`
- allowed action：仅 `npm stage publish`

验证一次 staged release 后，把传统 publishing access 设为“Require 2FA and disallow
tokens”，并撤销 bootstrap token。

## 后续 staged release

在 GitHub Actions 手动运行 `Release`，ref 选择已通过的 tag，`action` 选择 `stage`。工作流
会重新构建和 smoke，而不是信任旧 artifact，然后以 OIDC 把 34 个 tarball 分别送入 npm
staging area。

批准前逐个核对：package name/version、SHA-512、文件列表、依赖版本、provenance、tag 和
workflow run。全部一致后在 npmjs.com 的 Staged Packages 页面以 2FA 批准。多包发布不是
原子的，因此应先批准 binding/sidecar 平台包，再批准 binding，最后批准 `imagemin-rs`。

## 失败与回滚

- 构建、校验或 smoke 失败：不 stage、不发布；修复后发新 tag。
- stage 内容不符：reject stage，不能批准后再修补同版本。
- 部分 bootstrap publish：只从原 artifact 补齐缺失包；若内容本身错误，弃用已发布版本并
  发布新 patch。
- 已公开版本有问题：立即移动 `latest`/`next` 到最后一个健康版本并 `npm deprecate` 问题
  版本；除非满足 npm unpublish policy 且确认没有消费者，否则不 unpublish。
- 任何情况下都不重用 npm version，不移动已推送 release tag。

发布完成的定义不是 workflow 变绿，而是 tag、GitHub artifact、34 个 npm package、dist-tag、
provenance 和安装后全 codec smoke 对同一版本一致。
