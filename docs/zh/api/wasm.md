# 浏览器 WASM API

`@imagemin-rs/wasm` 在浏览器或 Web Worker 中运行 imagemin-rs 的共享 Rust
pipeline。API 为异步、纯内存形式：输入输出都是 `Uint8Array`，不需要 Node.js native
binding 或外部可执行 sidecar。

需要完整的文件选择、module Worker、取消、下载与部署示例时，请先阅读
[浏览器与 Web Worker 指南](/zh/guide/browser-wasm)。

## 安装与初始化

```sh
pnpm add @imagemin-rs/wasm@next
```

调用插件或 pipeline API 前初始化一次。常规浏览器 ESM 与 bundler 会自动加载相邻的
`.wasm` 文件；有自定义资源策略时，也可以传入 URL、`WebAssembly.Module`、Response
或字节。

```ts
import { initWasm, isWasmInitialized } from "@imagemin-rs/wasm";

await initWasm();
console.log(isWasmInitialized()); // true
```

重复调用会复用同一个初始化 Promise；初始化失败后允许重试。

## 内存图片优化

```ts
import { initWasm, optimize, oxipng } from "@imagemin-rs/wasm";

await initWasm();

const input = new Uint8Array(await (await fetch("/image.png")).arrayBuffer());
const result = await optimize(input, {
  plugins: [oxipng({ optimizationLevel: 3, strip: "safe" })],
});

console.log(result.data, result.inputBytes, result.outputBytes, result.steps);
```

支持的内置插件：

| 插件            | 输入 | 行为                                      |
| --------------- | ---- | ----------------------------------------- |
| `oxipng()`      | PNG  | 无损 Oxipng profile；不会保留更大的输出。 |
| `optipng()`     | PNG  | 原生 OptiPNG-compatible 参数映射。        |
| `giflossless()` | GIF  | 保留帧、动画与播放时序的无损优化。        |
| `svgm()`        | SVG  | 带资源边界的 SVG safe/default profile。   |

连续的内置插件会融合为一次 Rust pipeline 调用；浏览器自定义插件仍是普通函数，并严格按
数组顺序执行：

```ts
const copy = async (input: Uint8Array) => new Uint8Array(input);

const result = await optimize(input, {
  plugins: [oxipng(), copy],
});
```

## 错误与取消

Rust 参数校验和 codec 失败会抛出 `ImageminError`。`code` 是稳定的
`ERR_IMAGEMIN_*`，`plugin` 在可用时标识当前内置插件。初始化或资源加载失败使用
`ERR_IMAGEMIN_WASM_LOAD`。

`AbortSignal` 会在插件之间检查。WASM codec 一旦开始执行就是同步计算，signal
不能抢占当前调用。CPU 密集任务应放进 Web Worker；需要强制取消时终止 Worker。
文档 Playground 使用的就是这种模型。

## Runtime 边界

该包不包含文件路径、glob、输出目录、CLI、磁盘缓存、N-API 或可执行 sidecar。因此
`gifsicle`、`pngquant`、`mozjpeg`、`jpegtran`、`webp` 与 `avif` 仍只支持
Node.js。`svgo` 也保留在 JavaScript compatibility seam；共享 Rust/WASM SVG
profile 使用 `svgm()`。

发布包会在 Chromium、Firefox 与 WebKit 中执行浏览器验收。推荐以
`application/wasm` MIME 提供 `.wasm` 资源；配置不正确时 generated loader
会回退到 buffered instantiation。
