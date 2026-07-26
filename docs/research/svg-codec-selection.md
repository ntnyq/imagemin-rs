# Phase 1 SVG codec 选型与 `imagemin-svgo` 兼容性调研

## 调研范围与结论

- 调研日期：2026-07-17（Asia/Shanghai）。
- 只使用官方仓库、官方项目文档、npm registry、crates.io/docs.rs 与发布包源码；没有使用博客、聚合榜单或第三方 benchmark 作为决策依据。
- 目标不是选择“能缩小 SVG 的工具”，而是为 imagemin-rs Phase 1 选择一条能够逐步替代 `imagemin-svgo`、可由 napi-rs 安全嵌入、最终可发布的实现路径。

**明确推荐：**

1. 兼容基准固定为 [`imagemin-svgo@12.0.0`](https://registry.npmjs.org/imagemin-svgo/12.0.0)，源码提交固定为 [`911b98c9`](https://github.com/imagemin/imagemin-svgo/tree/911b98c96eae6e06513d2d01d143262ed33c294a)。它声明 `svgo: ^4.0.0`；按本次调研时 registry 的实际解析结果，差分预言机应精确固定为 [`svgo@4.0.2`](https://registry.npmjs.org/svgo/4.0.2)，源码提交 [`b2309cf5`](https://github.com/svg/svgo/tree/b2309cf541aee11634eb653157b0ff86ab326e98)。同时保留 `4.0.0` 的最低版本契约样本，防止把 patch 版本漂移误当作 imagemin-rs 行为。
2. **原生核心首选 [`svgm-core = "=0.3.8"`](https://docs.rs/crate/svgm-core/0.3.8)**，对应提交 [`b45d20d7`](https://github.com/madebyfrmwrk/svgm/tree/b45d20d797893cfd9a0c1eb864a0de5516ae6f9a)。原因是：MIT/Apache-2.0 双许可、核心无 `unsafe`、依赖面小、Rust/N-API/WASM 都有一手实现、固定点循环和安全 preset 可直接嵌入。
3. **不能把 SVGM 直接宣传成 SVGO 4 配置兼容实现。** 它只提供 preset、全局 precision、按名称启停 pass；不支持 SVGO 的插件参数、用户指定顺序、重复插件、自定义 JS plugin、`js2svg`、`path`、`datauri` 或可关闭的 multipass。发布兼容层必须对每个 option 做显式映射；未映射的 option 不得静默忽略。
4. **完整替代 `imagemin-svgo` 的推荐路线是原生快路径加精确 JS 回退。** 已经由 corpus 证明等价的配置走 SVGM/napi-rs `AsyncTask`；自定义 plugin 或未覆盖的 SVGO 配置走精确固定的 `svgo@4.0.2`。这使 `svgo()` 从第一版就可替换现有调用，同时允许原生覆盖率逐阶段增加。SVGO 只作为包内兼容执行器和差分预言机，不进入 Rust core。
5. **当前不建议直接依赖 OXVG 发布 crate。** OXVG 的插件面与 SVGO 更接近，但官方自己明确提示它不是精确克隆、稳定性敏感场景应继续使用 SVGO；`oxvg_optimiser@0.0.5` 的配置转换还会去重插件并按内部固定顺序执行。更重要的是，crate 整体声明 MIT，但其 `precheck.rs` 文件明确声明 GPLv2 派生许可；在上游澄清或重写前，不应把它链接进本项目的 MIT 发布物。

这不是法律意见；OXVG 的许可冲突应由维护者或专业法律审查最终确认。在确认前采取不分发该代码的保守策略。

## 固定基准

| 项目            | 固定版本 / 提交                                            | 一手证据                                                                                                                                                                                                                                                                                           | 本项目用途                   |
| --------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `imagemin-svgo` | `12.0.0` / `911b98c96eae6e06513d2d01d143262ed33c294a`      | [npm metadata](https://registry.npmjs.org/imagemin-svgo/12.0.0)、[package.json](https://github.com/imagemin/imagemin-svgo/blob/911b98c96eae6e06513d2d01d143262ed33c294a/package.json)、[runtime](https://github.com/imagemin/imagemin-svgo/blob/911b98c96eae6e06513d2d01d143262ed33c294a/index.js) | JS API 与行为基准            |
| `is-svg`        | `6.1.0` / `b38f4cd7dff15133a04f7fbb133805e982ed3a17`       | [npm metadata](https://registry.npmjs.org/is-svg/6.1.0)、[runtime](https://github.com/sindresorhus/is-svg/blob/b38f4cd7dff15133a04f7fbb133805e982ed3a17/index.js)、[fixtures/tests](https://github.com/sindresorhus/is-svg/blob/b38f4cd7dff15133a04f7fbb133805e982ed3a17/test.js)                  | 输入识别契约                 |
| SVGO            | `4.0.2` / `b2309cf541aee11634eb653157b0ff86ab326e98`       | [npm metadata](https://registry.npmjs.org/svgo/4.0.2)、[核心 API](https://github.com/svg/svgo/blob/b2309cf541aee11634eb653157b0ff86ab326e98/lib/svgo.js)、[类型](https://github.com/svg/svgo/blob/b2309cf541aee11634eb653157b0ff86ab326e98/lib/types.ts)                                           | 兼容回退与差分预言机         |
| OXVG            | crate `0.0.5` / `7e6a259acac73a08b325c296c4287bd30170586c` | [docs.rs 发布源码](https://docs.rs/crate/oxvg_optimiser/0.0.5/source/)、[VCS metadata](https://docs.rs/crate/oxvg_optimiser/0.0.5/source/.cargo_vcs_info.json)、[提交](https://github.com/noahbald/oxvg/tree/7e6a259acac73a08b325c296c4287bd30170586c)                                             | 候选，不直接采用             |
| OXVG main       | `29f67422fb6ea511ae63325a1db01596f47c9414`                 | [固定提交](https://github.com/noahbald/oxvg/tree/29f67422fb6ea511ae63325a1db01596f47c9414)                                                                                                                                                                                                         | 观察后续改进，不作为发布依赖 |
| SVGM            | `0.3.8` / `b45d20d797893cfd9a0c1eb864a0de5516ae6f9a`       | [docs.rs 发布源码](https://docs.rs/crate/svgm-core/0.3.8/source/)、[VCS metadata](https://docs.rs/crate/svgm-core/0.3.8/source/.cargo_vcs_info.json)、[release tag](https://github.com/madebyfrmwrk/svgm/tree/b45d20d797893cfd9a0c1eb864a0de5516ae6f9a)                                            | 推荐原生核心                 |

`imagemin-svgo@12.0.0` 发布包的 `gitHead` 是 `911b98c9`，其依赖范围不是固定版本。`svgo@4.0.2` 是 2026-07-17 registry 的 current latest；因此“对应 SVGO”不能只写成模糊的 4.x，也不应继续以 4.0.1 作为当前预言机。

## `imagemin-svgo@12` 的真实接口与默认行为

### 工厂协议

公开协议是：

```ts
type ImageminSvgo = (options?: SvgoConfig) => (input: Buffer) => Promise<Buffer>;
```

README 声明输入和输出都是 `Buffer`，运行时工厂返回 `async` plugin：[README API](https://github.com/imagemin/imagemin-svgo/blob/911b98c96eae6e06513d2d01d143262ed33c294a/readme.md)、[实现](https://github.com/imagemin/imagemin-svgo/blob/911b98c96eae6e06513d2d01d143262ed33c294a/index.js)。兼容实现需要保留以下实际行为：

- 每次 plugin 调用前把 options 归一化为 `{ multipass: true, ...options }`，所以默认是多轮优化，但调用者显式传 `multipass: false` 可以关闭。
- Node `Buffer` 以默认 UTF-8 解码；`is-svg@6.1.0` 做完整 XML/SVG 检测。检测为非 SVG 时返回原输入，不抛错、不复制。
- 被识别为 SVG 后，同步调用 SVGO 的 `optimize()`，再把 `data` 编码为新的 `Buffer`。外层虽然是 Promise 接口，SVGO 计算本身仍发生在 Node 主线程。
- options 原样传给 SVGO；`imagemin-svgo` 没有自己的 option 白名单或 schema。
- 损坏 XML 常被 `is-svg` 判为非 SVG并直接原样返回。上游“损坏 SVG 应报错”的测试被标记为 failing，而不是当前契约：[上游四个测试](https://github.com/imagemin/imagemin-svgo/blob/911b98c96eae6e06513d2d01d143262ed33c294a/test.js)。

这意味着本项目应区分三类结果：

1. 明确不是 SVG：兼容模式原样返回；
2. 看起来是 SVG 但违反本项目安全策略：以稳定错误码拒绝，或交给 JS 兼容回退；
3. 合法 SVG：进入原生或 JS 优化器。

### SVGO 4.0.2 配置语义

SVGO 的 `Config` 包含 `path`、`multipass`、`floatPrecision`、`plugins`、`js2svg` 与 `datauri`：[类型定义](https://github.com/svg/svgo/blob/b2309cf541aee11634eb653157b0ff86ab326e98/lib/types.ts#L335-L356)。关键运行时语义来自 [`optimize`](https://github.com/svg/svgo/blob/b2309cf541aee11634eb653157b0ff86ab326e98/lib/svgo.js#L78-L142)：

- `multipass: false` 运行一轮；`true` 最多运行十轮，并在输出不再变小时停止。
- 未提供 `plugins` 时使用 `['preset-default']`；一旦提供数组，该数组替换默认 preset，而不是追加到默认列表。
- plugin 按数组顺序调用；重复 plugin 可以重复运行。字符串、带 `name/params` 的内置 plugin、带 JS `fn` 的自定义 plugin 都属于公开类型。
- `floatPrecision` 作为全局 override 传给支持它的 plugin。
- `path` 进入 plugin info；`prefixIds` 等 plugin 可使用它生成稳定前缀。
- `js2svg` 控制序列化；`datauri` 可把结果变为 base64、编码或未编码的 Data URI。
- 未知 plugin、非数组 `plugins`、无 `name` 的对象会抛错；`null`/`undefined` plugin 项被忽略并警告。

SVGO 4.0.2 的 default preset 由 34 个 plugin 按固定顺序组成：[preset source](https://github.com/svg/svgo/blob/b2309cf541aee11634eb653157b0ff86ab326e98/plugins/preset-default.js)。`removeScripts`、`removeTitle`、`removeViewBox` 都不是默认 plugin；默认优化不是安全清洗器。`imagemin-svgo` 的默认测试会保留空 `<script/>`，只有显式添加 `removeScripts` 才删除脚本。

还有一个容易误实现的兼容点：`imagemin-svgo` README 与测试仍展示旧式 `active` 字段，但 SVGO 4 的 resolver 只读取 `name`、`params` 和可选 `fn`，不会读取 `active`。因此兼容基准应以运行时为准；禁用 default plugin 的正确方式是 `preset-default.params.overrides`，而不是复制 README 中的旧字段。

### 必须保留与可以改进的行为

| 行为                                        | 兼容层政策                                                   |
| ------------------------------------------- | ------------------------------------------------------------ |
| `svgo(options?)(Buffer) -> Promise<Buffer>` | 必须保留                                                     |
| 默认 `multipass: true`，显式 `false` 可关闭 | 必须保留                                                     |
| 非 SVG 原样返回                             | 必须保留；测试引用相等                                       |
| plugin 数组顺序与重复项                     | 完整兼容路径必须保留                                         |
| 自定义 JS `fn`                              | 只能走 JS 兼容执行器，不能跨 N-API 序列化                    |
| CPU 工作占用主线程                          | 应改进为 napi-rs `AsyncTask`；这是性能改进，不是输出语义变化 |
| 损坏 SVG 静默返回                           | 兼容模式保留；`strict`/原生安全路径可稳定报错并公开差异      |
| DTD/实体                                    | 推荐原生路径拒绝；不能为了兼容接受无资源上限的实体扩展       |
| 默认保留 script                             | 必须明确记录；优化器不是 sanitizer                           |

## 候选比较

| 维度             | OXVG `oxvg_optimiser@0.0.5`                                                               | SVGM `svgm-core@0.3.8`                                                         | 结论                                                 |
| ---------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------- |
| 目标             | 明确以 SVGO job 为模型，提供 `Jobs` 和 SVGO plugin 配置转换                               | 独立 Rust 重写，34 个 pass 与固定点收敛                                        | OXVG 的概念映射更近                                  |
| Rust API         | 调用者自己解析 `oxvg_ast`、运行 `Jobs`、序列化                                            | `optimize(&str)` / `optimize_with_config(&str, &Config)`                       | SVGM 更深、更易封装                                  |
| 默认执行         | 一轮 `Jobs::run`；multpass 需调用者实现                                                   | 固定点循环，最多十轮                                                           | SVGM 更接近 imagemin-svgo 默认 multipass，但不能关闭 |
| 配置             | 每个 job 有结构化参数；converter 接受部分 SVGO plugin 数组                                | preset、precision、`HashMap<String, bool>`                                     | OXVG 参数覆盖更广；两者都不完整兼容                  |
| plugin 顺序/重复 | converter 去重，最终按 `Jobs` 内部固定顺序执行                                            | 固定 catalog 顺序，只支持启停                                                  | 两者都不能直接重现任意 SVGO pipeline                 |
| 自定义 JS plugin | 明确不支持                                                                                | 不支持                                                                         | 都需 JS 回退                                         |
| default preset   | 与 SVGO 名称高度重合，但额外独立运行 `applyTransforms`，部分顺序不同                      | 34 pass，但缺 SVGO 的 `mergeStyles`、增加 `minifyWhitespace`，名称和顺序均不同 | 都不能仅凭“34/35 个 pass”宣称等价                    |
| 许可             | workspace 声明 MIT，但 `precheck.rs` 明确声明 GPLv2 派生                                  | MIT OR Apache-2.0                                                              | 当前发布决策选择 SVGM                                |
| `unsafe`         | arena 实现和 N-API config cast 含 `unsafe`                                                | `svgm-core` 源码没有 `unsafe`                                                  | SVGM 审计面更小                                      |
| 依赖             | CSS/selector/DOM 栈较大；发布 crate 的 sibling 约束为 `>=0.0`                             | `xmlparser`、`svgtypes`、`thiserror` 三个直接依赖                              | SVGM 构建与供应链更简单                              |
| 解析安全         | roxmltree 路径有 1024 层限制；默认解析拒绝 DTD                                            | 不扩展自定义实体，但没有节点/深度限制，AST 遍历含递归                          | 两者都需要项目级资源限制；SVGM 必须先补深度防护      |
| 测试             | 大量 per-job snapshot；另有像素 correctness 工具，但未接入 CI workflow                    | 约 205 个 core `#[test]`、37 个提交的 fixture，强调结构、重解析和幂等          | 两者都需本项目渲染回归门禁                           |
| 跨平台           | 纯 Rust core；官方 N-API/WASM；N-API 包覆盖 macOS x64/arm64、Linux x64 glibc、Windows x64 | 纯 Rust core；官方 N-API/WASM；N-API 发布还覆盖 Linux x64 musl                 | 都可嵌入本项目自己的平台 binding                     |
| 稳定信号         | `0.0.x`，README 明示某些 crate 不稳定、稳定性敏感者继续用 SVGO                            | `0.3.8`，README 仍称 early，但 API 更小                                        | SVGM 风险更容易由 Adapter 隔离                       |
| MSRV             | edition 2021，未声明 `rust-version`                                                       | edition 2024，未声明 `rust-version`                                            | 本项目必须自设并测试 MSRV                            |

## OXVG 评估

### 优点

- `Jobs` 与 SVGO plugin 名称/参数形状高度接近，默认 job 列表直接参照 SVGO；官方甚至提供 `from_svgo_plugin_config`/`convertSvgoConfig`：[Jobs 实现](https://github.com/noahbald/oxvg/blob/7e6a259acac73a08b325c296c4287bd30170586c/crates/oxvg_optimiser/src/jobs/mod.rs)、[官方 N-API binding](https://github.com/noahbald/oxvg/blob/7e6a259acac73a08b325c296c4287bd30170586c/packages/napi/src/lib.rs)。
- crate 有 `serde`、`napi`、`wasm` feature，官方仓库同时维护 Node 与 WASM 包：[crate manifest](https://github.com/noahbald/oxvg/blob/7e6a259acac73a08b325c296c4287bd30170586c/crates/oxvg_optimiser/Cargo.toml)、[WASM binding](https://github.com/noahbald/oxvg/blob/7e6a259acac73a08b325c296c4287bd30170586c/packages/wasm/src/lib.rs)。
- 每个 job 有密集 snapshot；仓库另有基于 `@napi-rs/canvas` 的像素比较工具：[correctness runner](https://github.com/noahbald/oxvg/blob/7e6a259acac73a08b325c296c4287bd30170586c/packages/correctness/index.js)。
- roxmltree Adapter 在构造 OXVG AST 时检查超过 1024 层的树：[parser](https://github.com/noahbald/oxvg/blob/7e6a259acac73a08b325c296c4287bd30170586c/crates/oxvg_ast/src/parse/roxmltree.rs)。

### 兼容性缺口

- 官方 README 明确写明它不是 SVGO 的精确克隆，可能有差异；依赖稳定性的用户应暂时继续用 SVGO：[官方声明](https://github.com/noahbald/oxvg/blob/29f67422fb6ea511ae63325a1db01596f47c9414/readme.md#L16-L27)。
- `convertSvgoConfig` 文档明确说自定义 plugin 和不兼容参数会失败；实现把数组转换为 `Jobs` 字段，因此重复 plugin 被去重，用户顺序被内部 struct 顺序替代。
- 字符串 `'preset-default'` 能展开默认 job，但标准的对象形式 `{ name: 'preset-default', params: { overrides: ... } }` 在发布实现中没有对应 `Jobs` 字段，不能直接映射。
- 顶层 `multipass`、`path`、`floatPrecision`、`js2svg`、`datauri` 不属于 `Jobs`。部分可以由本项目 wrapper 补齐，但仍需要逐项 conformance test。
- OXVG 默认列表把 `applyTransforms` 作为独立默认 job，并且 `removeUnusedNS`/`mergePaths` 的相对顺序与 SVGO 4 default preset 不同；输出和边界行为不能假定一致。

### 发布阻断项：许可不一致

仓库根许可与 workspace manifest 声明 MIT：[LICENSE](https://github.com/noahbald/oxvg/blob/7e6a259acac73a08b325c296c4287bd30170586c/LICENSE)、[workspace package](https://github.com/noahbald/oxvg/blob/7e6a259acac73a08b325c296c4287bd30170586c/Cargo.toml)。但同一发布提交的 [`precheck.rs`](https://github.com/noahbald/oxvg/blob/7e6a259acac73a08b325c296c4287bd30170586c/crates/oxvg_optimiser/src/jobs/precheck.rs#L1-L6) 明确写着该文件基于 `svgcleaner` 派生并按 GPL v2 分发；它不是独立 feature，属于 `oxvg_optimiser` 正常源码。

因此本项目当前不应：

- 直接把 `oxvg_optimiser` 链接进 MIT 的 `.node` 发布物；
- 仅通过不调用 `Extends::Safe` 来假设 GPL 文件不影响分发；
- 在没有上游书面澄清或 clean-room 重写的情况下复制该文件。

重新评估 OXVG 的前置条件是：上游修复许可声明或移除/重写该派生实现；发布一个新的精确版本；本项目再对该版本做 license scan 和 corpus conformance。

### 其他工程风险

- `oxvg_optimiser@0.0.5` 对 `oxvg_ast`、`oxvg_path` 等 sibling crate 使用 `>=0.0` 约束：[发布 manifest](https://docs.rs/crate/oxvg_optimiser/0.0.5/source/Cargo.toml)。Cargo.lock 可以冻结一次解析，但更新时兼容范围过宽，必须使用依赖审计和 locked CI。
- arena 代码使用 raw pointer `unsafe`，需要额外审计：[arena source](https://github.com/noahbald/oxvg/blob/29f67422fb6ea511ae63325a1db01596f47c9414/crates/oxvg_ast/src/arena.rs)。
- correctness runner 是有价值的手工工具，但当前 workflow 没有把 `packages/correctness` 设为 PR gate；不能把工具存在视为持续无渲染回归的证据。

## SVGM 评估

### 为什么作为推荐原生核心

- `svgm-core` API 足够深：输入字符串，内部完成 parse、固定点 optimize、serialize，返回数据和迭代次数；本项目不需要绑定其 AST 生命周期：[core API](https://github.com/madebyfrmwrk/svgm/blob/b45d20d797893cfd9a0c1eb864a0de5516ae6f9a/crates/svgm-core/src/lib.rs)。
- 直接依赖只有 `xmlparser`、`svgtypes`、`thiserror`；核心源码没有 `unsafe`：[manifest](https://github.com/madebyfrmwrk/svgm/blob/b45d20d797893cfd9a0c1eb864a0de5516ae6f9a/crates/svgm-core/Cargo.toml)。
- 默认运行最多十次并在所有 pass 都未报告变化时停止：[optimizer](https://github.com/madebyfrmwrk/svgm/blob/b45d20d797893cfd9a0c1eb864a0de5516ae6f9a/crates/svgm-core/src/optimizer.rs)。这与 `imagemin-svgo` 默认 multipass 的目标接近，并且不需要重复解析 AST。
- 配置包含 `Safe`/`Default` preset、全局 precision 和显式 pass override，未知 pass 可以由 Adapter 在进入 core 前拒绝：[config](https://github.com/madebyfrmwrk/svgm/blob/b45d20d797893cfd9a0c1eb864a0de5516ae6f9a/crates/svgm-core/src/config.rs)。
- 上游同时维护 WASM 和 napi-rs binding，说明 core 没有本机 C 库或文件系统耦合：[WASM](https://github.com/madebyfrmwrk/svgm/blob/b45d20d797893cfd9a0c1eb864a0de5516ae6f9a/crates/svgm-wasm/src/lib.rs)、[N-API](https://github.com/madebyfrmwrk/svgm/blob/b45d20d797893cfd9a0c1eb864a0de5516ae6f9a/crates/svgm-napi/src/lib.rs)。本项目仍应使用自己的 `AsyncTask`，因为上游 N-API 函数是同步的。
- 许可为 MIT OR Apache-2.0，适合本项目 MIT 发布：[MIT](https://github.com/madebyfrmwrk/svgm/blob/b45d20d797893cfd9a0c1eb864a0de5516ae6f9a/LICENSE-MIT)、[Apache-2.0](https://github.com/madebyfrmwrk/svgm/blob/b45d20d797893cfd9a0c1eb864a0de5516ae6f9a/LICENSE-APACHE)。

### 不能掩盖的兼容缺口

SVGM README 所称“34 passes / SVGO feature parity”是功能类别与压缩效果陈述，不是配置协议等价：[README](https://github.com/madebyfrmwrk/svgm/blob/b45d20d797893cfd9a0c1eb864a0de5516ae6f9a/README.md)。源码对比表明：

- SVGO default 有 `mergeStyles`；SVGM catalog 没有该 pass，改有 `minifyWhitespace`。
- pass 名称存在差异，例如 `removeXMLProcInst` / `removeProcInst`、`removeEditorsNSData` / `removeEditorData`、`removeUnusedNS` / `removeUnusedNamespaces`。
- pass 顺序明显不同，特别是 `removeDesc`、`cleanupIds`、结构转换的位置。
- plugin-specific params 不存在；precision 也只进入少数几种 Rust pass。
- 所有运行都是 fixed-point；没有 `multipass: false` 的单轮 API。
- serializer 没有 SVGO `js2svg` 的公开选项；也没有 `path`、`datauri`。

因此建议把 SVGM 放在私有 Adapter 后，外部仍使用 SVGO 兼容 options。不要从 `svgm_core::Config` 直接生成公开 TypeScript 类型。

### 安全与正确性风险

优点：解析器只解码五个 XML 内置实体和数字实体，不执行外部资源访问，也不展开 DTD 中的自定义实体：[parser](https://github.com/madebyfrmwrk/svgm/blob/b45d20d797893cfd9a0c1eb864a0de5516ae6f9a/crates/svgm-core/src/parser.rs)。这降低了 XXE 和实体炸弹风险。

但当前源码仍有以下项目级阻断项：

- parser 没有输入字节数、节点数或嵌套深度限制；`Document::traverse` 和 `remove` 使用递归：[AST](https://github.com/madebyfrmwrk/svgm/blob/b45d20d797893cfd9a0c1eb864a0de5516ae6f9a/crates/svgm-core/src/ast.rs)。恶意深嵌套输入可能造成栈耗尽。
- DTD token 被忽略，自定义实体不会按源文档语义展开。如果接受这类输入并继续序列化，结果可能合法但渲染语义改变。原生路径应在 parse 前显式拒绝 `DOCTYPE`/`ENTITY`，而不是静默优化。
- core 没有取消或 deadline。`AsyncTask` 只把 CPU 工作移出 JS 主线程，不能自动中止已经进入 optimizer 的任务。
- 已提交测试强调 parseable、幂等、结构不变量和若干回归；没有像 SVGO regression workflow 那样在 PR 上用浏览器截图逐像素比较。上游 core 目前提交了 37 个 fixture；本项目必须补充更大的独立 corpus 和渲染 gate：[integration tests](https://github.com/madebyfrmwrk/svgm/blob/b45d20d797893cfd9a0c1eb864a0de5516ae6f9a/crates/svgm-core/tests/integration.rs)。
- workspace 使用 Rust 2024 edition 且没有声明 `rust-version`。本项目需要在 CI 明确 MSRV，而不是跟随 `stable` 漂移。

这些风险可由私有 Adapter、输入预扫描、fork/上游贡献和测试门禁控制，比 OXVG 当前的许可不确定性更可控。

## 其他候选为何不选

### `svgcleaner`

[`RazrFalcon/svgcleaner`](https://github.com/RazrFalcon/svgcleaner) 已于 2021-10-30 归档，最新 release `0.9.5` 来自 2018 年，仓库声明 GPL-2.0。它不适合作为持续维护的 MIT npm 原生依赖；可以阅读其 correctness 思路，但不能复制 GPL 实现。

### crates.io 的 `svgo`

[`svgo@0.0.4`](https://docs.rs/crate/svgo/0.0.4) 发布于 2024-10-06。官方 crate 页面列出的实现状态只有 remove comments 和 remove doctype，multipass、路径、颜色、属性、结构等大多数能力仍未实现。它不足以承担 Phase 1。

### `resvg` / `usvg`

它们是 SVG 解析/规范化/渲染工具，不是 SVGO plugin 兼容优化器。推荐作为静态 SVG 的独立渲染预言机和结构验证器，而不是生产优化 backend。渲染器不覆盖脚本、交互、完整 CSS/浏览器差异，因此仍需浏览器截图与结构不变量测试。

## 推荐实现架构

```text
svgo(options?) factory
        |
        v
validate + normalize exact SVGO 4 options
        |
        +-- native-supported profile --> private descriptor
        |                                  |
        |                                  v
        |                           napi-rs AsyncTask
        |                                  |
        |                                  v
        |                        imagemin SVG Adapter
        |                                  |
        |                                  v
        |                         svgm-core =0.3.8
        |
        +-- custom/unsupported config --> pinned svgo@4.0.2
```

### 公开 API

- 保持 `svgo(options?)(input)` 与 imagemin plugin 一致。
- `SvgoOptions` 以 SVGO 4 `Config` 为兼容目标；项目扩展选项不要混进该对象，避免与未来 SVGO 字段冲突。
- 如需强制原生，另提供清晰的 `svgm()` 或 `nativeSvg()` 工厂；不要让 `svgo()` 在遇到不支持项时静默丢弃配置。
- `svgo()` 默认采用 `auto`：原生映射已通过 conformance 时使用 native，否则使用 JS 回退。选择过程是私有实现细节，输出统计可记录实际 engine 供诊断。

### Rust Adapter

- 依赖固定为 `svgm-core = "=0.3.8"`，只在一个私有 `codec::svg` module 使用。
- 定义项目自有、可版本化的 descriptor；不要把 `svgm_core::Config` 穿透 N-API。
- 输入 `Buffer` 在 JS 层或 binding 层以严格 UTF-8 解码；无效 UTF-8 返回稳定的 `INVALID_INPUT`，不要 lossy decode。
- 在调用 SVGM 前检查：最大输入字节、最大节点/标签计数、最大嵌套深度、禁止 DTD/ENTITY。推荐初始默认值由 corpus 分位数确定，而不是拍脑袋写死；硬上限必须可在 breaking-policy 下调整。
- 在 fork 或上游贡献中把 SVGM AST 遍历改为显式栈，并加入最大节点/深度；在此完成前，预扫描是发布前必要防线。
- 运行于 napi-rs `AsyncTask`。批量文件仍受本项目 pipeline 并发上限约束，不能把每个 SVG 无界地提交给 libuv pool。
- 对 `multipass: false`：在 SVGM core 提供单轮入口前走 JS 回退，不能把 fixed-point 当成单轮。

### JS 兼容回退

- 使用精确版本 `svgo@4.0.2`，不写 `^4.0.2`。
- 仅在 public package 层加载；Rust crate 和 native platform packages 不依赖 Node 模块。
- 自定义 plugin `fn`、用户顺序/重复 plugin、`preset-default.params.overrides`、`js2svg`、`path`、`datauri` 首版直接走回退。
- 当一个配置从 fallback 升级为 native 快路径时，必须先增加固定 conformance fixture，并作为 semver patch 中的内部性能变化发布；输出差异要经过回归阈值审查。

### 可先映射的原生子集

首批只建议承诺以下显式配置：

- `options === undefined` 或只含 `floatPrecision`，前提是默认 corpus 渲染与结构门禁全部通过；
- `plugins: ['preset-default']`；
- 由本项目公开兼容表列出的无参数启停 pass；
- 项目自有 `nativeSvg()` 的 `preset: 'safe' | 'default'`、`precision`、boolean pass overrides。

以下内容在有专门实现前全部 fallback，而不是“尽量映射”：

- `multipass: false`；
- 任意 custom `fn`；
- 重复或非默认顺序 plugin；
- `preset-default` 的 params/overrides；
- 任意 plugin-specific params；
- `path`、`js2svg`、`datauri`。

即使 `options === undefined`，也只有在测试证明后才能走 native。SVGM 与 SVGO 的 byte output 不需要相同，但渲染、引用、尺寸、可访问性与安全不变量必须相同。

## 完整测试策略

### 1. 上游 JS 契约

把 `imagemin-svgo` 官方测试扩展为本项目契约：

- 默认优化 `<svg><script></script></svg>` 后仍保留 `<script/>`；
- 显式 `removeScripts` 后删除脚本；
- 非 SVG 返回同一个输入对象；
- `Buffer` 输入/输出与 Promise rejection 形状；
- `multipass` 默认 true、显式 false；
- `plugins: []` 不自动加入 preset；
- plugin 顺序与重复项；
- custom JS plugin；
- 未知 plugin、畸形 config、缺 name 的错误；
- 有效但含 XML declaration、注释、DTD、非英文文本的 `is-svg` 样本；
- `is-svg` 的 invalid corpus 原样返回。

### 2. 差分 corpus

按许可保留 NOTICE 后引入或生成以下样本：

- `imagemin-svgo` 官方 4 个行为测试；
- `is-svg@6.1.0` 的 valid/invalid/entity cases；
- SVGO 4.0.2 官方 372 个 plugin `.svg.txt` fixtures；
- SVGO 官方 regression workflow 的公开样本和 expected mismatch/ignore 清单；
- SVGM 的 path torture、CSS、`defs/use`、`foreignObject`、animation fixtures；
- 本项目拥有的 Figma、Illustrator、Inkscape、Sketch、图标与手写 SVG；
- mask、filter、clipPath、gradient、pattern、marker、symbol/use、CSS selector、media query、`currentColor`、RTL/非英文文本、title/desc。

SVGO 自己的 regression runner 使用 Playwright/Chromium、禁用 JavaScript、截图并以 pixelmatch 比较，同时把结果作为 PR workflow gate：[compare runner](https://github.com/svg/svgo/blob/b2309cf541aee11634eb653157b0ff86ab326e98/test/regression/compare.js)、[workflow](https://github.com/svg/svgo/blob/b2309cf541aee11634eb653157b0ff86ab326e98/.github/workflows/regression.yml)。本项目应复用这种“渲染结果优先”的原则，而不是只断言输出更短。

### 3. 多层正确性断言

每个 native-supported fixture 至少验证：

1. 输出是严格 UTF-8，能被项目 parser、`usvg` 和浏览器重新解析；
2. `width`、`height`、`viewBox`、根 namespace 与 aspect ratio 策略一致；
3. 所有 `url(#id)`、`href`/`xlink:href`、CSS ID/class selector、marker/filter/mask/clipPath 引用仍能解析到目标；
4. `title`、有意义的 `desc`、ARIA、role、language/direction 不被意外移除；
5. animation、script、event attribute、`foreignObject` 按公开策略保留或拒绝；
6. 静态渲染在透明、黑、白背景和至少两个 viewport 下无超阈值差异；
7. native 输出二次运行幂等；
8. 输出变大时遵循本项目统一 keep-original 政策，并记录 step statistics。

不要只用 resvg 判定动态或浏览器特性正确；这些文件需要结构不变量和 Chromium 用例。

### 4. 安全与资源回归

必须加入：

- SVGO 4.0.2 官方 nested/flat billion-laughs fixtures：[security regression](https://github.com/svg/svgo/blob/b2309cf541aee11634eb653157b0ff86ab326e98/test/svgo/billion-laughs.test.js)；
- 外部实体、内部实体、递归实体、超长 entity 名称；
- 超过最大嵌套深度、节点数、属性数、单属性长度、CSS 长度、path command 数；
- 未闭合标签、错配标签、多根节点、HTML 内嵌 SVG、只有 `<svg` 前缀；
- 大量重复 transform/selector/path，验证固定点十轮上限；
- parser/optimizer `cargo-fuzz` target，断言无 panic、无栈溢出、无超限分配；
- 资源预算测试：输入大小、p95 wall time、峰值 RSS、worker-pool 排队；
- 无网络/文件访问测试，确保 SVG 内容不能触发外部加载。

默认 `removeScripts` 不启用，文档必须明确“优化不等于净化”。如未来提供 sanitizer，应是独立 preset/API 和威胁模型。

### 5. N-API 与平台测试

- event-loop heartbeat 证明优化发生在 `AsyncTask`，而不是同步 binding；
- 多文件批量输入验证 pipeline 并发上限；
- invalid options 在进入 worker 前稳定拒绝，codec/parse 错误以 Promise rejection 返回；
- Linux glibc/musl、macOS x64/arm64、Windows x64 都执行真实 native SVG smoke test；
- 平台包 tarball smoke install，断网环境加载 `.node`；
- WASM 如果作为 fallback 发布，运行同一份受支持配置契约，不另造语义。

## Phase 1 验收门槛

在公开宣称 `imagemin-svgo@12` 可替代前，必须同时满足：

- `svgo()` 工厂、Buffer/Promise、non-SVG pass-through、默认 multipass 与错误行为有契约测试；
- 固定 `svgo@4.0.2` oracle，不存在范围漂移；
- 公开兼容表逐项列出 native、JS fallback、unsupported，不使用笼统“SVGO compatible”；
- 所有 unsupported option 都 fallback 或以稳定错误拒绝，无静默忽略；
- native profile 的完整 corpus 无未批准渲染差异，引用/尺寸/可访问性不变量通过；
- DTD/entity、深度、节点数、输入大小和十轮上限有资源测试；
- SVG codec 在 napi-rs worker 上运行，Node 主线程不被阻塞；
- `cargo deny`/许可证清单确认发布闭包只含允许许可证；
- 三大 OS 和 Linux musl 的真实 binding smoke test 通过；
- VitePress 文档包含迁移示例、兼容矩阵、安全说明和 engine fallback 诊断。

## 风险登记与后续观察

| 风险                              | 当前处置                                              | 解除条件                                          |
| --------------------------------- | ----------------------------------------------------- | ------------------------------------------------- |
| SVGM 与 SVGO 默认输出/顺序不同    | 用 SVGO oracle + JS fallback；native 只覆盖已证明子集 | corpus 和渲染门禁通过                             |
| SVGM 无深度/节点上限、递归遍历    | Adapter 预扫描；优先上游贡献或维护小型 fork           | core 提供迭代遍历与硬限制                         |
| SVGM edition 2024、无 MSRV        | 项目固定并测试 MSRV                                   | 上游声明 `rust-version` 或本项目持续验证          |
| JS fallback 增加包体积            | 以兼容正确性优先；测量按需加载成本                    | native 覆盖率足够高且剩余配置可拆为可选 compat 包 |
| OXVG 许可冲突                     | 不链接、不分发                                        | 上游明确许可并发布修复版本，license scan 通过     |
| OXVG 0.0.x API 和 sibling `>=0.0` | 仅观察固定 commit                                     | 稳定 release、精确依赖和 conformance 通过         |
| SVGO patch 版本继续变化           | oracle 精确锁定；定期手工升级                         | 新版本差分报告和安全回归通过                      |
| SVG 保留脚本/动态内容             | 文档声明非 sanitizer；结构测试                        | 独立 sanitizer API 与威胁模型落地                 |

## 最终决策

Phase 1 应采用以下组合，而不是在单一候选上做过度承诺：

- **兼容真相源：** `imagemin-svgo@12.0.0` + 精确 `svgo@4.0.2`；
- **推荐原生实现：** 私有 Adapter 包装 `svgm-core@0.3.8`；
- **完整兼容保障：** JS 层按配置自动回退到精确 SVGO；
- **后续候选：** OXVG 仅在许可和稳定性问题解决后重新评估；
- **长期方向：** 把经 conformance 证明的 SVGO 配置逐步移入本项目自有 Rust SVG module，直到 JS fallback 可以缩小为可选兼容包。

这是当前最推荐的做法：先保证用户迁移不会丢配置或破坏 SVG，再用可测量、可回滚的方式扩大 Rust 原生覆盖，而不是把“Rust 重写”误当成“SVGO 兼容”。
