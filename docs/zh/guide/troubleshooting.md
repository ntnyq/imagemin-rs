# 安装与运行排错

imagemin-rs 通过 npm optional dependencies 分发预编译原生 binding 和 codec
可执行文件。安装过程不会下载二进制，也不会在用户机器上编译原生代码。

## 支持的运行目标

当前 release matrix 覆盖：

- macOS x64 与 arm64；
- Linux x64 与 arm64 glibc；
- Linux x64 与 arm64 musl；
- Windows x64 与 arm64。

要求 Node.js 22.13+。CI 会在 Linux、macOS 与 Windows 上验证 Node.js 22、24、26。
最低操作系统、kernel 和 libc 版本见[平台支持政策](./platform-support.md)。

## `ERR_IMAGEMIN_NATIVE_LOAD`

这个错误码表示当前平台的 binding 无法加载。请检查：

1. package manager 或部署参数没有禁用 optional dependencies；
2. lockfile 在目标部署平台生成，或允许安装该平台依赖；
3. bundler 或 serverless packager 没有漏掉原生 `.node` 文件；
4. `process.platform` 和 `process.arch` 属于支持目标；
5. Linux 使用受支持的 glibc 或 musl 目标。

可在失败环境输出基本 runtime 信息：

```sh
node -e 'console.log({ arch: process.arch, node: process.version, platform: process.platform, report: process.report?.getReport().header })'
```

在全新目录中只运行 `pnpm add imagemin-rs@next` 复现。如果全新安装成功，请对比应用的
依赖裁剪和 bundling 配置。

## codec sidecar 无法启动

`gifsicle()`、`pngquant()`、`mozjpeg()`、`jpegtran()` 和 `webp()` 使用平台专用
可执行文件包。请确认 production pruning 保留了对应包：

```sh
pnpm why @imagemin-rs/sidecars-linux-x64-gnu
pnpm why @imagemin-rs/sidecar-pngquant-linux-x64-gnu
pnpm why @imagemin-rs/sidecar-gifsicle-linux-x64-gnu
```

按目标平台替换 package suffix。容器必须在与运行环境相同的操作系统、架构和 libc
镜像中安装依赖；不支持跨这些边界复制 `node_modules`。

AVIF 在独立 Node process 中使用 Sharp。部署 bundler 还必须保留 Sharp 的 optional
平台包和内嵌共享库。

## 稳定错误码

| 错误码                         | 含义                               |
| ------------------------------ | ---------------------------------- |
| `ERR_IMAGEMIN_INVALID_INPUT`   | 输入无效、超限或结构不安全         |
| `ERR_IMAGEMIN_INVALID_OPTIONS` | option 未知、冲突或越界            |
| `ERR_IMAGEMIN_NATIVE_LOAD`     | 原生 binding 缺失或无法加载        |
| `ERR_IMAGEMIN_CODEC`           | 内置 codec 或 sidecar 执行失败     |
| `ERR_IMAGEMIN_PLUGIN`          | 第三方插件抛错或 reject            |
| `ERR_IMAGEMIN_PLUGIN_OUTPUT`   | 插件返回了不支持的值               |
| `ERR_IMAGEMIN_IO`              | source 或 destination 文件系统失败 |
| `ERR_IMAGEMIN_ABORTED`         | 操作被取消                         |

批处理错误会在具体文件失败时包含 `sourcePath`；codec 和插件错误会尽可能包含 `plugin`。

## 取消与部分输出

取消会停止调度新的批处理任务，并终止内置 sidecar。不支持 signal 协作的原生任务或
第三方插件可能在公开 Promise reject 后继续占用 CPU。

文件批处理不是事务。abort 或后续失败之前已经写入的文件仍保留在 destination；需要
all-or-nothing 时必须由调用方清理。

## 浏览器 Playground 输出不同

不缩放的 PNG 输出使用 `@imagemin-rs/wasm` 与共享 Rust Oxipng codec。缩放后的 PNG、
JPEG 与 WebP 输出会经过浏览器 Canvas，因此不同浏览器的字节可能不同，codec option、
metadata 策略与动画支持也不等同于 Node API。

WASM 资源加载失败时，请确认它与 generated JavaScript chunk 一起部署，并以
`application/wasm` MIME 提供。显式初始化选项见
[浏览器 WASM API](/zh/api/wasm)。

如果受支持平台的全新安装仍失败，请提交 GitHub issue，并附上错误码、runtime report、
package manager 及版本、lockfile 格式和最小复现。
