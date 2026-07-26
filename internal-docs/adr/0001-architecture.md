# ADR 0001：兼容门面、深 Rust Module 与私有 native fast-path

- 状态：Accepted；Rust crate 粒度部分由 ADR 0008 修订
- 日期：2026-07-17

## 背景

项目要同时满足三类需求：

1. 现有 imagemin 用户希望继续使用默认导出的 `imagemin(inputs, options)`、`imagemin.buffer(input, options)` 和函数型插件。
2. Rust codec 需要在 napi-rs worker pool 中运行，不能阻塞 Node.js 主线程。
3. 新 API 需要返回格式、输入/输出大小和逐插件统计，而不是只返回字节。

上游证据和插件流行度记录在 [`docs/research/upstream-landscape.md`](../../docs/research/upstream-landscape.md)。

## 决策

### 公开 TypeScript Interface

保留 imagemin 兼容门面，并增加一个带统计的命名入口：

```ts
type ImageminPlugin = (input: Uint8Array) => Uint8Array | PromiseLike<Uint8Array>;

declare function optimize(
  input: Uint8Array,
  options?: { plugins?: readonly ImageminPlugin[] },
): Promise<OptimizationResult>;

declare function imagemin(
  inputs: readonly string[],
  options?: ImageminOptions,
): Promise<ImageminResult[]>;

imagemin.buffer = async (input, options) => (await optimize(input, options)).data;
```

原生插件工厂（例如 `oxipng()`）在调用者看来仍是 `ImageminPlugin`。它们对应的 `NativePluginDescriptor` 存在私有 `WeakMap` 中，不进入公开 Interface。连续的原生插件会合并为一次 N-API 调用；任意 JS 插件会成为不可跨越的顺序 seam。

### Rust Module

首阶段只建立一个深 `crates/imagemin` Module：

```rust
pub fn optimize(
    input: Vec<u8>,
    plugins: &[NativePluginDescriptor],
) -> Result<OptimizationResult>;
```

格式探测、顺序 pipeline、options 校验、输出不变式、统计与 codec Adapter 都隐藏在这个 Interface 后面。首阶段不为每个计划中的 codec 预建一个浅 crate。Phase 6 后依赖和测试边界已经稳定，因此按本 ADR 预设的触发条件完成拆分；现行结构见 ADR 0008，`crates/imagemin` 的兼容 Interface 保持不变。

### N-API Seam

`napi/imagemin` 是薄 Adapter：

- 把 `Buffer` 和私有 descriptor 转换成 Rust 类型；
- 用 `AsyncTask::compute` 执行全部 CPU codec 工作；
- 在 `resolve` 中只创建 JavaScript Buffer/对象；
- 把 Rust 错误前缀映射为稳定的公共错误码。

不使用 `#[napi] async fn` 直接执行图片压缩，因为 Tokio async 不会自动把 CPU 工作变成非阻塞。

### I/O Seam

glob、文件读取、目标路径、建目录和写盘留在 `packages/imagemin`。Rust 不接收路径，不访问文件系统。文件 I/O 测试使用真实临时目录；在出现第二个生产 Adapter 前不公开 File I/O port。

## Interface 不变量

- 输入与输出统一为 `Uint8Array` 语义；不修改调用者输入。
- 单个图片内插件严格按声明顺序执行。
- 连续 native 插件可以融合，但不能越过 JS 插件。
- native codec 与当前格式不匹配时是 no-op；识别到目标格式但内容损坏时是错误。
- 不支持的 option 必须报错，不能静默忽略。
- `imagemin.buffer()` 即使无插件也返回 Promise 和新的字节副本。
- 多文件可并行，结果数组顺序保持输入展开顺序。
- 批量写盘不是事务；失败前已经成功写入的文件可能存在。
- 原生 codec 不阻塞 Node 主线程；第三方同步 JS 插件仍可能阻塞。

## 稳定错误码

```text
ERR_IMAGEMIN_INVALID_INPUT
ERR_IMAGEMIN_INVALID_OPTIONS
ERR_IMAGEMIN_UNSUPPORTED_PLUGIN
ERR_IMAGEMIN_PLUGIN_OUTPUT
ERR_IMAGEMIN_PLUGIN
ERR_IMAGEMIN_CODEC
ERR_IMAGEMIN_IO
ERR_IMAGEMIN_NATIVE_LOAD
```

`code` 是可编程依赖；`message` 可以改进。底层错误保留为 `cause`，但不承诺其文本稳定。

## 目录

```text
crates/imagemin/          稳定 Rust facade 与 native plugin registry
crates/imagemin-core/     asset、format、error、开放 plugin trait 与 pipeline
crates/imagemin-codec-*/  按格式聚合的 native codec 实现
napi/imagemin/            napi-rs AsyncTask Adapter
packages/imagemin/        稳定 JS Interface、I/O、旧插件兼容
docs/                     VitePress 用户文档
docs/research/            带来源的研究，站点排除
internal-docs/            ADR 与实现计划
fixtures/                 后续跨层真实图片语料
tasks/                    后续 conformance/benchmark 工具
scripts/                  后续 artifact/release preflight
```

平台 `npm/*` 目录不常驻源码树；发布 CI 使用 `napi create-npm-dirs` 生成。

## 比较过的替代方案

### 公开 `nativePlugin(codec, options)` descriptor

优点是可序列化、易持久化、易一次性编译。缺点是普通 imagemin 用户必须学习第二套插件协议。当前不采用；若配置持久化成为真实需求，可在不破坏函数插件的前提下新增。

### `Engine.compile(program)` + routes + async events

优点是天然支持多输出、背压、收集错误、WASM 和详细统计。缺点是 Interface 宽，首版多数 seam 尚未被第二个 Adapter 证明。当前不采用；当多 route/WebAssembly 有真实调用者和基准时再评估。

### 每个 codec 一个 crate 和 npm package

长期可能改善 feature、链接和独立发布，但首阶段会产生大量浅 Module。因此首阶段先以内
部 Adapter 验证边界，Phase 6 后再由已经证明的依赖、测试与资源策略触发 ADR 0008 的拆分。

## 结果

调用者获得熟悉的 imagemin 体验，维护者获得明确的 JS/N-API/Rust locality。新增 codec 只需要增加内部 Adapter、插件工厂、options 类型和分层测试，不需要扩张 core Interface。
