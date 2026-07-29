# imagemin-rs 发布手册

更新日期：2026-07-29

当前 P1 发布单元由 18 个同版本 npm 包组成：`imagemin-rs`、`@imagemin-rs/binding`、
8 个 `@imagemin-rs/binding-*` 平台包和 8 个 `@imagemin-rs/sidecars-*` 平台包。P2
加入 GPL sidecar 家族后会扩展为 34 包。任何一个包都不能单独版本漂移。`0.0.0`
只表示未发布开发状态，发布脚本会拒绝它。

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
   pnpm run release:verify
   pnpm run release:bundle:current
   pnpm run release:smoke
   ```

5. 提交并推送已验证 commit，再创建不可变 tag `v0.x.y`。tag 必须和所有 manifest 的
   `0.x.y` 一致。
6. 等待 `Release` workflow 的 8 个 binding 构建、8 个 cwebp 构建、18 包汇总和 8 平台
   全 codec tarball smoke 全部通过。下载并保存 `release-packages` artifact；其中的
   `release-manifest.json` 含每个 tarball 的 SHA-512 integrity。

本地 `release:bundle:current` 只证明当前 OS/CPU。不能用它替代 GitHub workflow 的 8
平台门禁。

## 首次发布引导

npm 不允许 brand-new package 使用 staged publishing，而且 package 尚不存在时也无法给它
配置 trusted publisher。因此当前 18 个包的首次版本必须由 maintainer 在 tag workflow 全通过后
用交互式 npm 登录和 2FA 引导一次：

```sh
node tasks/release/publish-packages.mjs \
  --mode=publish \
  --bootstrap \
  --bundle=/absolute/path/to/release-packages
```

脚本先验证 bundle integrity，再按“8 binding 平台包 → 8 sidecar 平台包 → binding →
public package”的顺序发布。
不要在 CI 中保存 bootstrap token。若中途失败，只继续补齐同一已验证 bundle 中缺失的包；
不要重新打包或移动 tag。

首次版本可见后，分别为全部 18 个包配置：

- GitHub owner：`ntnyq`
- repository：`imagemin-rs`
- workflow filename：`release.yml`
- environment：`npm`
- allowed action：仅 `npm stage publish`

验证一次 staged release 后，把传统 publishing access 设为“Require 2FA and disallow
tokens”，并撤销 bootstrap token。

## 后续 staged release

在 GitHub Actions 手动运行 `Release`，ref 选择已通过的 tag，`action` 选择 `stage`。工作流
会重新构建和 smoke，而不是信任旧 artifact，然后以 OIDC 把 18 个 tarball 分别送入 npm
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

发布完成的定义不是 workflow 变绿，而是 tag、GitHub artifact、18 个 npm package、dist-tag、
provenance 和安装后全 codec smoke 对同一版本一致。
