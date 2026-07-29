# 浏览器与 Web Worker 指南

图片字节已经位于浏览器中，且应用不需要 Node.js 路径、glob、native binding 或外部
sidecar 时，使用 `@imagemin-rs/wasm`。该包提供异步、纯内存 API，输入输出都是
`Uint8Array`。

本指南同时覆盖适合小任务的主线程调用，以及面向生产应用、保持页面响应的 module
Worker。完整可运行项目位于
[`examples/browser-wasm`](https://github.com/ntnyq/imagemin-rs/tree/main/examples/browser-wasm)。

## 选择 Runtime

| 需求                                 | Browser WASM     | Node 包                  |
| ------------------------------------ | ---------------- | ------------------------ |
| 内存中的 GIF、PNG 或 SVG             | 支持             | 支持                     |
| 文件路径、glob、输出目录             | 不支持           | 支持                     |
| `giflossless`、`oxipng`、`optipng`   | 支持             | 支持                     |
| `svgm`                               | 支持             | 支持                     |
| Gifsicle、pngquant、JPEG、WebP、AVIF | 不支持           | 支持                     |
| 强制取消                             | 终止 Web Worker  | 取决于进程/worker 策略   |
| 浏览器本地处理                       | 支持，不需要上传 | 不适用，在 Node 进程运行 |

## 安装

公开试用期使用 npm `next` tag：

```sh
pnpm add @imagemin-rs/wasm@next
```

1.0 发布后可省略 `@next`，安装稳定的 `latest`。

## 小任务直接调用

对于小图片或受控的一次性任务，可以直接在主线程调用。初始化一次，把图片字节传给
`optimize()`；需要显示或下载时，再把结果转换为 `Blob`。

<<< ../../../examples/browser-wasm/src/direct.ts

`AbortSignal` 可以拒绝排队中的工作，并在插件之间检查。一旦 codec 已经进入
WebAssembly，同步计算不能被 signal 抢占。页面必须保持响应，或取消操作必须停止当前
计算时，应使用 Worker。

## 运行完整 Worker 示例

在仓库根目录执行：

```sh
pnpm install
pnpm example:browser:dev
```

打开 Vite 输出的本地地址，选择 PNG、动画 GIF 或 SVG，即可优化并下载。验证生产构建：

```sh
pnpm example:browser:build
```

构建会执行 TypeScript 检查，并输出主线程 JavaScript、独立 module Worker 和带 hash
的 `.wasm` 资产。示例在两个线程之间转移 `ArrayBuffer` 所有权，避免 structured
clone 复制图片数据。

::: code-group

<<< ../../../examples/browser-wasm/src/main.ts [src/main.ts]

<<< ../../../examples/browser-wasm/src/image-worker.ts [src/image-worker.ts]

:::

主线程负责 DOM 状态、下载和 Worker 生命周期；Worker 负责初始化 WASM 与执行 codec。
`worker.terminate()` 是强制取消边界；后续任务会创建干净的 Worker 并重新初始化
runtime。

## 文件输入与下载流程

可运行示例使用完全位于浏览器内的流程：

1. `File.arrayBuffer()` 读取本地文件；
2. `postMessage(request, [bytes])` 把 buffer 转移给 Worker；
3. Worker 包装为 `Uint8Array` 并运行对应内置插件；
4. 优化后的 buffer 被转移回主线程；
5. `Blob` 与 `URL.createObjectURL()` 提供本地下载；
6. 暴露下一份结果前撤销旧 object URL。

该流程不会上传图片。若应用自行把字节发送到服务器，那是额外的应用行为，不是
`@imagemin-rs/wasm` 的要求。

## 初始化与资产控制

Vite 等能够处理 package asset 的 bundler 使用默认初始化：

```ts
import { initWasm } from "@imagemin-rs/wasm";

await initWasm();
```

generated loader 会找到相邻、带 hash 的 WASM 资产。把 WASM binary 复制到受控 URL 的
应用可以显式传入 Response：

```ts
const response = await fetch("/assets/imagemin_wasm_core_bg.wasm");
if (!response.ok) throw new Error(`WASM request failed: ${response.status}`);

await initWasm(response);
```

`initWasm()` 也接受 URL、字节或已经编译的 `WebAssembly.Module`。并发调用共享一个
初始化 Promise；修复资产问题后，可以重试失败的初始化。

## 部署检查表

- Worker chunk、`.wasm` 资产和应用 JavaScript 必须一起部署，不能只复制入口 JS。
- 使用 `application/wasm` MIME。loader 可以回退到 buffered instantiation，但正确
  MIME 才能使用 streaming compilation。
- 资产位于其他域名时，允许对应 CORS origin，并确认重定向没有丢失 header。
- 带内容 hash 的 Worker/WASM 资产可以 immutable cache；不要给引用这些 hash 的 HTML
  使用同样的长期缓存。
- 把 Worker 与 WASM 位置加入应用 CSP。准确的 `worker-src`、`script-src` 和 fetch
  策略取决于部署方式；应测试生产 header，而不是关闭 CSP。
- SSR framework 只能在客户端创建 Worker，例如 mounted hook 或事件处理器。
  server rendering 阶段没有 `window` 和 `Worker`。
- 用最终部署 URL 在 Chromium、Firefox 与 WebKit 验证，不能只测试 dev server。

## 错误与恢复

捕获 `ImageminError`，记录稳定的 `code` 与可选 `plugin`：

| Code                           | 含义                             |
| ------------------------------ | -------------------------------- |
| `ERR_IMAGEMIN_WASM_LOAD`       | JS glue 或 WASM 资产加载失败。   |
| `ERR_IMAGEMIN_INVALID_INPUT`   | 输入不是字节，或超过大小限制。   |
| `ERR_IMAGEMIN_INVALID_OPTIONS` | 插件 option 或 signal 无效。     |
| `ERR_IMAGEMIN_CODEC`           | 所选 codec 拒绝该图片。          |
| `ERR_IMAGEMIN_ABORTED`         | 工作在两个可执行步骤之间被取消。 |
| `ERR_IMAGEMIN_PLUGIN`          | 自定义浏览器插件失败。           |

加载失败后，修复 URL、MIME、CORS 或 CSP，再次调用 `initWasm()`。终止 Worker 后，丢弃
尚未完成的 request ID，并在接收新任务前创建新的 Worker；示例已经实现这个流程。

## 支持的浏览器 Profile

| Factory         | 输入 | 说明                                         |
| --------------- | ---- | -------------------------------------------- |
| `giflossless()` | GIF  | 保留动画帧与播放时序。                       |
| `oxipng()`      | PNG  | 无损；不会保留更大的结果。                   |
| `optipng()`     | PNG  | Rust profile 提供 OptiPNG-compatible 参数。  |
| `svgm()`        | SVG  | 有资源边界的 safe/default 原生 SVG profile。 |

JPEG、WebP、AVIF、Gifsicle 与 pngquant 在 1.0 中仍只支持 Node。全部选项与准确 runtime
边界见[浏览器 WASM API](/zh/api/wasm)。[Playground](/zh/playground) 是已经部署的
Worker 应用，可用于快速手工验证。
