# Phase 2 GIF / OptiPNG codec 选型与兼容性调研

## 调研范围与结论

- 调研日期：2026-07-17（Asia/Shanghai）。
- 只使用官方仓库、发布源码、npm registry、crates.io/docs.rs 和格式规范等一手来源。
- 目标是确定 `imagemin-gifsicle@7` 与 `imagemin-optipng@8` 的真实运行时契约，并选择可由 napi-rs 安全嵌入、可跨平台发布且许可证闭包清晰的 Phase 2 实现。

**明确推荐：**

1. GIF 的兼容基准固定为 [`imagemin-gifsicle@7.0.0`](https://registry.npmjs.org/imagemin-gifsicle/7.0.0)，源码提交固定为 [`c91e5b2c`](https://github.com/imagemin/imagemin-gifsicle/tree/c91e5b2c1c8e7f0d2221ea779d19d3e6d1ab41be)。其依赖范围 `gifsicle:^5.0.0` 截至调研日会解析到 [`gifsicle@5.3.0`](https://registry.npmjs.org/gifsicle/5.3.0)，对应 gitHead [`7d471d8b`](https://github.com/imagemin/gifsicle-bin/tree/7d471d8bd4249452e1b4807525a2308936ee4f2f)，其中 vendored C 源码是 **Gifsicle 1.92**。差分预言机必须把这三个版本一起锁定，不能只锁顶层包。
2. **不要把 Gifsicle C 或 `gifsicle` Rust FFI crate 链入 MIT core，也不要采用 gifski。** Gifsicle 是 GPLv2；`gifsicle@1.95.0` crate 编译该 GPL C 源码并只提供 unsafe/raw FFI。gifski 是 AGPL-3.0-or-later，而且是会重新量化帧的高质量 GIF 制作器，不是 lossless Gifsicle 替代品。
3. GIF 原生路线采用自有的 conservative re-encoder：首选精确固定 `gif = "=0.14.2"` 与 `gif-dispose = "=6.0.0"`，并把项目 MSRV 从 1.88 提升到 1.90。第一阶段只做安全解析、应用扩展清理、LZW 重编码和 interlace；严格保存画布、帧数量、delay、disposal、loop、透明语义和逐帧合成像素。后续才以差分/渲染门禁加入 changed-rectangle 与 transparency delta。
4. `optimizationLevel` 的 1/2/3 和 `colors` 在原生算法被证明之前，必须路由到显式配置的外部 compatibility engine，或者以稳定错误拒绝，不能悄悄用“不太一样”的 Rust 算法。精确 engine 应是用户安装的外部 Gifsicle，或单独发布、许可证明确为 GPL 的 sidecar；不得自动捆入默认 MIT native 包。
5. PNG 的兼容基准固定为 [`imagemin-optipng@8.0.0`](https://registry.npmjs.org/imagemin-optipng/8.0.0)，提交 [`abae5230`](https://github.com/imagemin/imagemin-optipng/tree/abae52303e06e2b5697d32c529578e17f680fef7)，以及 [`optipng-bin@7.0.1`](https://registry.npmjs.org/optipng-bin/7.0.1)，提交 [`14f7065b`](https://github.com/imagemin/optipng-bin/tree/14f7065bdca9cb0bdc718a4a5b8ac982c8054f05)。后者的 vendored source 是 **OptiPNG 0.7.7**，采用 zlib license。
6. **现有 `oxipng@10.1.1` 可以承载 OptiPNG-shaped native API，但只能声明 API/视觉兼容，不得声明算法或 byte-for-byte 兼容。** 在发布前必须把 `StripChunks::None` 改为 `All`、处理 OptiPNG level 0 的特殊语义，并允许 metadata 清理、interlace 转换或 error recovery 的必要增大输出。Oxipng 官方也明确说明它不是 OptiPNG 的 drop-in replacement。

许可证部分不是法律意见；任何 GPL sidecar 的聚合边界、分发方式和源码义务都应在发布前由维护者或专业法律审查确认。

## 固定版本与证据

| 组件                   | 固定版本 / 提交                                       | 一手证据                                                                                                                                                                                                                                                                                                      | Phase 2 用途                    |
| ---------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `imagemin-gifsicle`    | `7.0.0` / `c91e5b2c1c8e7f0d2221ea779d19d3e6d1ab41be`  | [npm metadata](https://registry.npmjs.org/imagemin-gifsicle/7.0.0)、[package.json](https://github.com/imagemin/imagemin-gifsicle/blob/c91e5b2c1c8e7f0d2221ea779d19d3e6d1ab41be/package.json)、[runtime](https://github.com/imagemin/imagemin-gifsicle/blob/c91e5b2c1c8e7f0d2221ea779d19d3e6d1ab41be/index.js) | GIF JS API/行为基准             |
| `is-gif`               | `3.0.0` / `376626d248d01c4391d0106c1cdb9ce06e7126c7`  | [npm metadata](https://registry.npmjs.org/is-gif/3.0.0)、[runtime](https://github.com/sindresorhus/is-gif/blob/376626d248d01c4391d0106c1cdb9ce06e7126c7/index.js)                                                                                                                                             | 输入识别契约                    |
| `gifsicle` npm wrapper | `5.3.0` / `7d471d8bd4249452e1b4807525a2308936ee4f2f`  | [npm metadata](https://registry.npmjs.org/gifsicle/5.3.0)、[install source](https://github.com/imagemin/gifsicle-bin/blob/7d471d8bd4249452e1b4807525a2308936ee4f2f/lib/install.js)、[platform mapping](https://github.com/imagemin/gifsicle-bin/blob/7d471d8bd4249452e1b4807525a2308936ee4f2f/lib/index.js)   | 当前 exact oracle 的 executable |
| Gifsicle C             | `1.92`                                                | [vendored release archive](https://github.com/imagemin/gifsicle-bin/blob/7d471d8bd4249452e1b4807525a2308936ee4f2f/vendor/source/gifsicle-1.92.tar.gz)、[upstream tag](https://github.com/kohler/gifsicle/tree/v1.92)                                                                                          | GPL 外部预言机，不链接          |
| `gifsicle` Rust FFI    | `1.95.0` / `0213d7f4a5af2fcc28642ddaa48351bc4a67688b` | [release source](https://docs.rs/crate/gifsicle/1.95.0/source/)、[Cargo metadata](https://docs.rs/crate/gifsicle/1.95.0/source/Cargo.toml.orig)、[API](https://docs.rs/crate/gifsicle/1.95.0/source/src/lib.rs)                                                                                               | 被否决的嵌入候选                |
| `gifski`               | `1.34.0` / `1060eab4500a20f27e2fa3ab7e85473d0e921cbd` | [release source](https://docs.rs/crate/gifski/1.34.0/source/)、[manifest](https://docs.rs/crate/gifski/1.34.0/source/Cargo.toml.orig)、[API](https://docs.rs/crate/gifski/1.34.0/source/src/lib.rs)                                                                                                           | 被否决的重编码候选              |
| `gif`                  | `0.14.2` / `a0127e2acbef333398414bb61d097c19c1b09d8a` | [release source](https://docs.rs/crate/gif/0.14.2/source/)、[manifest](https://docs.rs/crate/gif/0.14.2/source/Cargo.toml.orig)、[decoder](https://docs.rs/crate/gif/0.14.2/source/src/reader/mod.rs)、[encoder](https://docs.rs/crate/gif/0.14.2/source/src/encoder.rs)                                      | 推荐 GIF parser/encoder         |
| `gif-dispose`          | `6.0.0` / `e9a8e962ad58191e7aa2efc6cffa139c3f9242d2`  | [release source](https://docs.rs/crate/gif-dispose/6.0.0/source/)、[manifest](https://docs.rs/crate/gif-dispose/6.0.0/source/Cargo.toml.orig)、[API](https://docs.rs/crate/gif-dispose/6.0.0/source/src/lib.rs)                                                                                               | 推荐逐帧 disposal 合成器        |
| `imagemin-optipng`     | `8.0.0` / `abae52303e06e2b5697d32c529578e17f680fef7`  | [npm metadata](https://registry.npmjs.org/imagemin-optipng/8.0.0)、[runtime](https://github.com/imagemin/imagemin-optipng/blob/abae52303e06e2b5697d32c529578e17f680fef7/index.js)、[tests](https://github.com/imagemin/imagemin-optipng/blob/abae52303e06e2b5697d32c529578e17f680fef7/test.js)                | PNG JS API/行为基准             |
| `optipng-bin`          | `7.0.1` / `14f7065bdca9cb0bdc718a4a5b8ac982c8054f05`  | [npm metadata](https://registry.npmjs.org/optipng-bin/7.0.1)、[install source](https://github.com/imagemin/optipng-bin/blob/14f7065bdca9cb0bdc718a4a5b8ac982c8054f05/lib/install.js)、[platform mapping](https://github.com/imagemin/optipng-bin/blob/14f7065bdca9cb0bdc718a4a5b8ac982c8054f05/lib/index.js)  | exact oracle executable         |
| OptiPNG C              | `0.7.7`                                               | [vendored release archive](https://github.com/imagemin/optipng-bin/blob/14f7065bdca9cb0bdc718a4a5b8ac982c8054f05/vendor/source/optipng.tar.gz)、[upstream release](https://sourceforge.net/projects/optipng/files/OptiPNG/optipng-0.7.7/)                                                                     | zlib-licensed PNG oracle        |
| `oxipng`               | `10.1.1` / `628e241e23f368097883807fa6e985ccf7c00357` | [release source](https://docs.rs/crate/oxipng/10.1.1/source/)、[manifest](https://docs.rs/crate/oxipng/10.1.1/source/Cargo.toml.orig)、[options](https://docs.rs/crate/oxipng/10.1.1/source/src/options.rs)                                                                                                   | 推荐 native PNG engine          |

`imagemin-gifsicle@7.0.0` 发布时的最低可解析依赖 `gifsicle@5.0.0` 内含 Gifsicle 1.91；当前范围最高版本 5.3.0 内含 1.92。因此兼容 fixture 至少保留一组 5.0.0/1.91 下界样本，但生产 oracle 必须精确锁 5.3.0/1.92，避免 npm range 漂移。

## `imagemin-gifsicle@7` 的真实契约

### 工厂与输入行为

公开形状是：

```ts
type ImageminGifsicle = (options?: GifsicleOptions) => (input: Buffer) => Promise<Buffer>;
```

实际实现见固定提交的 [`index.js`](https://github.com/imagemin/imagemin-gifsicle/blob/c91e5b2c1c8e7f0d2221ea779d19d3e6d1ab41be/index.js)：

- factory 默认 `options = {}`，返回 async function。
- 输入不是 Node `Buffer` 时，在 Promise 中拒绝，错误是 `TypeError`，消息为 ``Expected `input` to be of type `Buffer` but received type `${typeof input}```。
- `is-gif@3.0.0` 经 `file-type@10.x` 只用开头三个字节 `GIF` 识别；并不要求完整的 `GIF87a`/`GIF89a` 头。因此只含 `GIF` 前缀的损坏输入会进入 Gifsicle 并通常被子进程拒绝，而非 pass-through。[file-type 10.11.0 detector](https://github.com/sindresorhus/file-type/blob/02f666db30e1d3ee3b8c7566f7c8226e82583d63/index.js)
- 明确不是 GIF 时返回原 Buffer 对象，不复制，也不检查 options 是否有效。
- 被识别为 GIF 后，通过 `execa` 把 Buffer 写到 stdin，以 `encoding:null` 收集 stdout；成功时返回新的 Buffer，非零退出、spawn 失败或 signal 终止都成为 Promise rejection。
- 固定传入 `--no-warnings`，所以 warning 不出现在 stderr；真正的解析/option error 仍会导致非零退出。

上游只有两个测试：验证一个 fixture 变小且仍是 GIF，以及非 GIF 字符串内容保持不变；没有 animation preservation 或 option/error 测试。[upstream tests](https://github.com/imagemin/imagemin-gifsicle/blob/c91e5b2c1c8e7f0d2221ea779d19d3e6d1ab41be/test.js)

### options 的实际语义

实际 argv 从下面两项开始：

```text
--no-warnings --no-app-extensions
```

然后使用普通 JS truthiness：

| option              | README                  | 实际运行时                                                                                                                                    |
| ------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `interlaced`        | boolean，默认 false     | 只有 truthy 才传 `--interlace`；false/undefined 不会传 `--no-interlace`，因此 Gifsicle 默认复制输入帧的 interlace 状态，而不是强制关闭        |
| `optimizationLevel` | number 1..3，声称默认 1 | 只有 truthy 才传 `--optimize=<value>`；代码没有默认值。Gifsicle 1.92 的内部默认 `optimizing = 0`，所以 `imageminGifsicle()` **实际不启用 O1** |
| `colors`            | number 2..256           | 只有 truthy 才传 `--colors=<value>`；可能重新量化颜色，属于有损转换                                                                           |

README 的 default 1 与运行时不一致，兼容实现必须以代码为准。[README options](https://github.com/imagemin/imagemin-gifsicle/blob/c91e5b2c1c8e7f0d2221ea779d19d3e6d1ab41be/readme.md)

顶层没有 runtime schema：字符串、负数、4、257 等 truthy 值都会先转成 argv，再由 Gifsicle CLI 决定是否报错；数值 0、`NaN`、空字符串则被当作“未提供”。这也意味着 invalid options 对非 GIF 不报错，对 GIF 才可能拒绝。新的 TypeScript API可以把类型收紧，但 compatibility tests 需要记录这一差异。

### animation 与 extension 行为

Gifsicle 把 NETSCAPE loop extension 解析为 stream-level loopcount，再单独输出；`--no-app-extensions` 删除的是普通 application extension 列表。因此基准行为是：

- loop absence、finite count 与 infinite loop 必须保留；
- frame delay、disposal、position、logical screen、透明色与未显式改变的 interlace 应保留；
- comments、names、plain-text/非 application extensions 默认保留；
- 普通 application extensions 默认被删除，这是 `imagemin-gifsicle` 的有意 metadata policy；
- `colors` 除外，它可能改变 palette 和像素颜色；应单独以 lossy conformance 衡量。

Gifsicle 1.92 的官方 source 包包含 `gifdiff`，其源码比较 loop count 和逐帧合成结果，适合作为 CI 中的外部语义 oracle。[Gifsicle 1.92 source](https://github.com/kohler/gifsicle/tree/v1.92)、[GIF89a specification](https://www.w3.org/Graphics/GIF/spec-gif89a.txt)

## GIF 候选取舍

| 候选                                 | API/用途                                              | 许可                 | 维护/安全/嵌入性                                                                                                                | 决策                                                              |
| ------------------------------------ | ----------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Gifsicle C / `gifsicle@1.95.0` crate | raw C structs/functions 和 `gifsicle_main`            | GPLv2 / license-file | crate 标记 maintenance `as-is`；unsafe FFI；C CLI 有进程级全局状态，并含 `exit()`/`abort()`；直接从 N-API worker 并发调用不安全 | 不链接、不嵌入                                                    |
| `gifski@1.34.0`                      | RGBA/PNG/video frames 到新 GIF；quality/repeat/resize | AGPL-3.0-or-later    | 活跃、跨平台、多线程，但会做 imagequant、temporal dithering、frame reconstruction；默认 repeat infinite                         | 不作为 lossless/compat engine；未来若要产品化须另行商业/AGPL 决策 |
| `gif@0.14.2`                         | safe GIF streaming decoder + encoder                  | MIT OR Apache-2.0    | Rust 1.62；默认每帧 50 MB memory limit；支持 raw extensions、pre-encoded LZW、delay/disposal/transparency/interlace/repeat      | 推荐基础 parser/encoder                                           |
| `gif-dispose@6.0.0`                  | 按 disposal 合成 RGBA canvas                          | MIT OR Apache-2.0    | 纯 Rust、活跃；Rust 1.90；专门解决 raw frame 不足以正确渲染动画的问题                                                           | 推荐语义验证与 delta 计算                                         |
| external Gifsicle 1.92               | stdin/stdout CLI oracle                               | GPLv2 executable     | 精确，但 npm wrapper 的预编译平台陈旧，spawn 有开销                                                                             | optional exact engine / CI oracle                                 |

### 为什么不能直接用 sys crate

`gifsicle@1.95.0` 的 README 明确说它“compiles gifsicle's C codebase and exposes it as an unsafe Rust library”，build script 将 `gifsicle.c`、`optimize.c`、`gifread.c` 等直接编入目标，并把 `main` 重命名成 `gifsicle_main`。[README](https://docs.rs/crate/gifsicle/1.95.0/source/README.md)、[build.rs](https://docs.rs/crate/gifsicle/1.95.0/source/build.rs)

除了 GPL 传播风险，该接口本身也不是可靠的 in-process codec API：

- `src/lib.rs` 说明 methods mostly undocumented，需要直接读原始 C；
- CLI source 使用大量可变 global/static option 和 stream 状态；
- fatal path、帮助/版本路径和 allocator 包含 `exit()` 或 `abort()`；
- `gifsicle_main` 的 argc/argv 接口依赖 process-like stdin/stdout，并不自然映射到 Rust slices；
- crate 只在 docs.rs 构建了 x86_64 Linux target，没有为本项目的 Node 平台矩阵提供保证。

用全局 mutex 包住调用仍不能解决 `exit()` 终止 Node 进程、GPL 链接边界或隐式 stdio 问题。

### 为什么 gifski 不是替代品

gifski 的官方描述是 pngquant-based GIF maker；它接收完整 RGBA/PNG frames，进行 quantization、denoise、temporal dithering 和差分编码。[official README](https://github.com/ImageOptim/gifski/blob/1060eab4500a20f27e2fa3ab7e85473d0e921cbd/README.md)、[Settings](https://github.com/ImageOptim/gifski/blob/1060eab4500a20f27e2fa3ab7e85473d0e921cbd/src/lib.rs)

即使 `quality:100`，它也不是“保留输入 indexed palette 与 GIF 结构再优化”的 lossless re-encoder；其 default repeat 是 infinite，而输入 loop 需要调用者主动转换。更直接的阻塞是整个 crate 为 AGPL-3.0-or-later。它适合未来独立的 `gifski()`/GIF generation 产品，不适合当前 MIT `gifsicle()` compatibility path。

## 推荐 GIF 架构

```text
gifsicle(options)
        |
        +-- non-GIF ----------------------> same Buffer
        |
        +-- proven native profile --------> gif parser + owned re-encoder
        |                                      |
        |                                      +-- gif-dispose semantic validator
        |
        +-- O1/O2/O3 or colors -----------> configured external Gifsicle 1.92
                                               or stable unsupported error
```

### 推荐 public options

```ts
export interface GifsicleOptions {
  interlaced?: boolean;
  optimizationLevel?: 1 | 2 | 3;
  colors?: number;
}

export function gifsicle(options?: GifsicleOptions): ImageminPlugin;
```

保持 imagemin 的三个字段，不把 engine、limits、worker count 混进 codec options；这些属于 pipeline/runtime policy。`colors` 在运行时验证为整数 2..256。为了真实兼容，`optimizationLevel` 不应在 normalize 阶段补 1；undefined 就是没有 `-O`。

建议 native descriptor 内部记录：

```ts
type GifEngine = "native-safe" | "external-gifsicle-1.92";

interface GifDiagnostics {
  engine: GifEngine;
  compatibility: "exact" | "semantic";
  applicationExtensionsRemoved: number;
  frameCount: number;
}
```

不要公开 `gif`/`gif-dispose` 的 Rust 类型，避免将上游 SemVer 传播成 JS API。

### 初始 routing policy

| 配置                             | Phase 2 native                                          | external exact | 无 external 时               |
| -------------------------------- | ------------------------------------------------------- | -------------- | ---------------------------- |
| `{}`                             | 清理普通 application extensions，lossless LZW re-encode | 可用于 oracle  | native                       |
| `{interlaced:true}`              | 所有输出帧设置 interlace，保持其他语义                  | 可用于 oracle  | native                       |
| `{interlaced:false}` / undefined | 保持输入 interlace，不能强制关闭                        | 可用于 oracle  | native                       |
| `optimizationLevel:1/2/3`        | 初版不声称支持；算法逐阶段开放                          | 是             | `ERR_GIF_ENGINE_UNAVAILABLE` |
| `colors:2..256`                  | 初版不支持                                              | 是             | `ERR_GIF_ENGINE_UNAVAILABLE` |

native-safe 第一版可以只重编码现有 indexed pixels，不调用 `Frame::from_rgba*`，并关闭 `gif` crate 的 `color_quant` feature。这避免无意 palette quantization。使用 `Encoder::into_inner()` 显式完成 trailer，避免依赖 Drop 的错误处理；`raii_no_panic` 仍应启用。[gif encoder API](https://docs.rs/crate/gif/0.14.2/source/src/encoder.rs)

### delta re-encoder 的阶段门

后续自有 optimizer 可按 Gifsicle 的概念推进：

1. O1 类：在不改变 timeline 的前提下裁剪成 changed rectangle；
2. O2 类：使用透明像素表达 unchanged 区域；
3. O3 类：比较多种候选并选最小结果。

每个级别在公开前必须满足：

- 原始与输出帧数、delay centiseconds、loop policy 相同；
- disposal value 初期逐帧相同；如果未来算法需要改 disposal，必须把“结构相同”和“渲染相同”拆成两个 profile，不能偷偷改变；
- 全透明帧、Previous/Background disposal、局部 palette、canvas 外 frame、零 delay 和重复 frame 都通过；
- 每个 composited frame 的 RGBA 像素完全相同；
- external Gifsicle `gifdiff` 判定相同；
- 输出增长时遵循统一 keep-original policy，但 metadata policy 或损坏修复要求变化时不得返回不符合契约的原输入。

## `imagemin-optipng@8` 的真实契约

### 工厂与默认 options

固定源码在每次调用时归一化为：[runtime](https://github.com/imagemin/imagemin-optipng/blob/abae52303e06e2b5697d32c529578e17f680fef7/index.js)

```js
{
  optimizationLevel: 3,
  bitDepthReduction: true,
  colorTypeReduction: true,
  paletteReduction: true,
  interlaced: false,
  errorRecovery: true,
  ...options,
}
```

行为如下：

- 非 Buffer 以 `TypeError('Expected a buffer')` 拒绝。
- `is-png@2.0.0` 只检查完整的八字节 PNG signature；非 PNG 返回原 Buffer identity。[is-png runtime](https://github.com/sindresorhus/is-png/blob/57a50f7ccebf322f3beaf70985fbbca33decf76f/index.js)
- PNG 写入临时输入文件，OptiPNG 输出到临时输出文件，成功后读回新 Buffer；`exec-buffer` 在成功或失败后清理临时路径。[exec-buffer runtime](https://github.com/kevva/exec-buffer/blob/46673a4fb776389b08fe38ef1cc420f79a97acb9/index.js)
- 子进程异步执行，不阻塞 Node event loop；spawn/CLI/read/write error 都成为 rejection。

实际固定 argv 是：

```text
-strip all -clobber -o <optimizationLevel> -out <temp-output>
```

然后：

| option               | argv 语义                                                                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `errorRecovery`      | truthy 时追加 `-fix`；默认 true                                                                                               |
| `bitDepthReduction`  | falsey 时追加 `-nb`                                                                                                           |
| `colorTypeReduction` | falsey 时追加 `-nc`                                                                                                           |
| `paletteReduction`   | falsey 时追加 `-np`                                                                                                           |
| `interlaced`         | 只有 `typeof === 'boolean'` 才追加 `-i 1/0`；默认 false 强制 non-interlaced；显式 null/undefined 覆盖默认并保持输入 interlace |

`optimizationLevel` 没有 JS range/type validation；任何值都先进入 argv，由 OptiPNG 判断。上游测试覆盖默认损坏 PNG repair、`errorRecovery:false` rejection、三类 reductions 不抛错、interlaced true，以及 null/undefined 保留输入 interlace。[tests](https://github.com/imagemin/imagemin-optipng/blob/abae52303e06e2b5697d32c529578e17f680fef7/test.js)

### OptiPNG 0.7.7 的关键语义

官方 0.7.7 manual/source 定义：

- level 0 等价于 level 1 加 `-nx -nz`，即不做 bit/color/palette reductions，也不重编码 IDAT；
- levels 1..7 分别约为 1、8、16、24、48、120、240 个 zlib/filter trials；
- `-strip all` 删除除 `tRNS` 之外的 PNG ancillary metadata；
- `-fix` 以完整性优先，修补缺失 critical data 时允许输出增大；
- 默认不指定 `-i` 时保持输入 interlace，但 imagemin 默认明确传 `-i 0`。

证据来自 vendored 0.7.7 的 [official manual](https://optipng.sourceforge.net/optipng-0.7.7.man.html) 和 [release source](https://sourceforge.net/projects/optipng/files/OptiPNG/optipng-0.7.7/)。

## Oxipng 是否能安全映射 OptiPNG API

结论是“可以提供受约束的 semantic mapping，但不能称为 exact OptiPNG”。Oxipng 官方 README 明确写明架构和能力已经显著不同、不是 drop-in replacement。[official README](https://github.com/oxipng/oxipng/blob/628e241e23f368097883807fa6e985ccf7c00357/README.md)

### 映射表

| imagemin option / hidden behavior | Oxipng 10.1.1                 | fidelity 与要求                                                                                                                                                                  |
| --------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `optimizationLevel:0`             | `Options::from_preset(0)`     | **不等价**：Oxipng preset 0 仍默认允许 reductions/IDAT recoding；compat adapter 必须额外关闭 `bit_depth_reduction`、`color_type_reduction`、`palette_reduction`、`idat_recoding` |
| levels 1..6                       | `Options::from_preset(level)` | 都是 Oxipng 自己的 filters/libdeflater profiles，不是 OptiPNG 的 zlib trial 集，只能 semantic mapping                                                                            |
| level 7                           | 当前会映射/退化为 Oxipng 6    | 必须在 compatibility matrix 明示；不能声称 240 trials                                                                                                                            |
| `bitDepthReduction`               | `bit_depth_reduction`         | direct semantic mapping，level 0 例外                                                                                                                                            |
| `colorTypeReduction`              | `color_type_reduction`        | direct semantic mapping；Oxipng 的 RGB-to-gray 也受该开关控制                                                                                                                    |
| `paletteReduction`                | `palette_reduction`           | direct semantic mapping，算法/结果 palette 可不同                                                                                                                                |
| `interlaced:boolean/null`         | `interlace:Some(bool)/None`   | direct semantic mapping                                                                                                                                                          |
| `errorRecovery`                   | `fix_errors`                  | repair policy 近似，不保证修复同一批损坏文件或产生相同字节                                                                                                                       |
| `-strip all`                      | `StripChunks::All`            | 必须设置；当前本项目 `optipng.rs` 使用 `None` 是不兼容 bug                                                                                                                       |
| `-clobber/-out`                   | memory API 无对应需求         | 无语义影响                                                                                                                                                                       |
| 输出可能增大                      | `force` + adapter policy      | metadata strip、interlace change、repair 必须允许必要增长；不能被统一 keep-smaller 回退抹掉                                                                                      |

Oxipng `Options` 默认有 `max_decompressed_size:None`，本项目必须设置硬上限；它还提供 `timeout`，应由 pipeline budget 驱动。[Options source](https://github.com/oxipng/oxipng/blob/628e241e23f368097883807fa6e985ccf7c00357/src/options.rs)

### 当前原型需要修正的点

调研时仓库中的 `crates/imagemin/src/codec/optipng.rs` 已经做了 option 结构和 level 7->6 的显式近似，但有以下发布阻塞项：

1. `options.strip = StripChunks::None` 必须改为 `All`；`imagemin-optipng` 对所有 PNG 都传 `-strip all`。
2. level 0 不能只调用 `from_preset(0)`，还要禁用三类 reductions 和 IDAT recoding。
3. 通用 `optimize_with_options` 在 output 变大时总是返回原输入。对 `errorRecovery:true` 修复后的文件，这可能把损坏输入退还给用户；对 interlace 或 metadata 的强制转换，也可能丢失用户请求。
4. compat adapter 应设置 `force = true`，并在 codec outcome 中区分 `optimized`、`metadataChanged`、`interlaceChanged` 与 `repaired`；后面三类变化不适用普通 keep-original 回退。
5. APNG 单独进入 corpus。Oxipng 官方只承诺有限 APNG 优化，OptiPNG 0.7.7 的行为不能由静态 PNG fixture 推断。[Oxipng APNG note](https://github.com/oxipng/oxipng/blob/628e241e23f368097883807fa6e985ccf7c00357/README.md#apng-support)

修正后建议把 `optipng()` 文档表述为“兼容 imagemin option 形状并保持无损像素语义，由 Oxipng 实现”；另外保留 `oxipng()` 暴露原生 0..6 preset、strip safe/none/all、alpha 等能力。两个 API 不应共享一份含糊的 option 说明。

## 具体依赖建议

### 推荐主线

```toml
[workspace.package]
rust-version = "1.90.0"

[workspace.dependencies]
gif = { version = "=0.14.2", default-features = false, features = ["std", "raii_no_panic"] }
gif-dispose = "=6.0.0"
oxipng = { version = "=10.1.1", default-features = false, features = ["parallel"] }
```

选择 exact `=` 是因为 Phase 2 在做 codec conformance；升级必须伴随 corpus 差分，而不是由 semver range 自动改变输出。`gif-dispose@6.0.0` 要求 Rust 1.90；Node 用户使用预编译 binding 不受 MSRV 影响，源码构建者会看到明确要求。

如果项目必须保留 Rust 1.88，则备选是：

```toml
gif = { version = "=0.13.3", default-features = false, features = ["std", "raii_no_panic"] }
gif-dispose = "=5.0.1"
```

`gif-dispose@5.0.1` 的官方 manifest 要求 Rust 1.64 并依赖 `gif ^0.13.1`。[5.0.1 manifest](https://docs.rs/crate/gif-dispose/5.0.1/source/Cargo.toml.orig)

优先推荐提高 MSRV 使用当前版本，避免刚加入 codec 就固定在旧 major。

### 不加入默认 dependency closure

- `gifsicle` Rust crate：GPL、unsafe C FFI、process-global CLI API；
- `gifski`：AGPL，并改变图像；
- npm `gifsicle@5.3.0`：只允许 optional sidecar 或 dev oracle；
- npm `optipng-bin@7.0.1`：只作为 dev oracle，不进入 native runtime 包。

## 安全与资源限制

### GIF 默认限制

推荐在进入 decoder 前执行一次只读结构预扫描，并应用：

| 资源                          | 默认限值                | 原因                                                                |
| ----------------------------- | ----------------------- | ------------------------------------------------------------------- |
| compressed input              | 64 MiB                  | 防止单资产吞噬 worker 内存                                          |
| logical width/height          | 每边 16,384             | 格式允许 u16，但 65,535² canvas 不适合 Node library                 |
| canvas RGBA bytes             | 256 MiB                 | `gif-dispose` 会创建完整 RGBA screen，超出 `gif` 的 per-frame limit |
| decoded indexed bytes / frame | 64 MiB                  | 显式覆盖/收紧 `gif` 默认 50 MB 附近的预算，并统一错误码             |
| frame count                   | 10,000                  | 防止微小 frame 的 CPU bomb                                          |
| cumulative frame pixels       | 500 million             | 限制长动画的总解码工作量                                            |
| extension payload aggregate   | 16 MiB                  | GIF sub-block 可形成超长 metadata 链                                |
| LZW/output expansion ratio    | 1000x，且受绝对上限约束 | 检测 decompression bomb                                             |

limits 应属于 pipeline policy，可由可信离线任务显式提高；公共 codec options 不接受任意解除硬上限。启用 `DecodeOptions::check_frame_consistency(true)`、显式 `MemoryLimit::Bytes` 和 LZW end-code 检查；对外部 Gifsicle 还要设置 wall-time、stdout bytes、stderr bytes 和 child kill deadline。

### PNG 默认限制

建议把当前 256 MiB compressed / 512 MiB decompressed 的 hard limits 保留为绝对上限，但默认 profile 收紧为 64 MiB compressed / 256 MiB decompressed，并加：

- 最大单边 32,768；
- 最大 100 million pixels；
- Oxipng `max_decompressed_size` 必设；
- 每资产 timeout，低 level 30s、高 level 120s；
- nested parallelism semaphore。Oxipng 自身的 Rayon 与 napi-rs worker pool 叠加时容易过度订阅，不应让每个 pipeline item 同时占满所有 CPU。

error recovery 不等于忽略安全限制；超限、整数溢出、异常 chunk length 和资源耗尽必须稳定拒绝。

## corpus 与 conformance 计划

### 1. JS contract fixtures

对两个官方插件分别固定 package tarball 和 binary version，测试：

- Buffer/Promise 协议与 non-image identity；
- 三字节 GIF detection、八字节 PNG detection；
- argv snapshots，包括 false/null/undefined/0/truthy 非标准值；
- PNG/GIF parser error、spawn error、non-zero exit 和临时文件清理；
- 上游已有 tests 原样运行。

### 2. GIF 结构矩阵

生成并提交最小 fixtures，笛卡尔覆盖：

- GIF87a/GIF89a；global/local/no palette；interlaced/non-interlaced；
- single frame 和 2/3/1000 frames；
- disposal 0/1/2/3，尤其 Previous + clipped rectangle、Background + transparent canvas；
- delay 0、1、2、10、65535 centiseconds；user-input flag；
- loop absent、finite 1/2/65535、infinite；
- transparent index 0/255、全透明 frame、palette 中重复颜色；
- frame offset、changed rectangle、frame 超出 logical screen；
- comment、plain text、name、XMP/自定义 application extension、NETSCAPE loop extension；
- duplicate/oddly ordered extensions 和 trailing bytes。

每个 fixture 记录结构 manifest。native-safe 输出必须保留 delay/disposal/loop/transparency contract，并只删除基准要求删除的 ordinary application extensions。

### 3. GIF 渲染与 oracle

- 编译固定 Gifsicle 1.92 的 `gifdiff` 作为外部 CI tool；
- 用 `gif-dispose` 合成输入和输出每一帧，比较完整 RGBA hash；
- 再用一个独立 browser decoder（Chromium screenshot/video clock harness）做交叉检查，避免 parser 与 validator 共用同一 bug；
- 比较 animation total duration、loop policy 和每帧 delay，不只比较第一帧；
- O1/O2/O3 native 候选同时与 exact Gifsicle output 和原输入比较；byte equality 只作为诊断，pixel/timeline equality 才是 pass condition；
- `colors` 如果未来原生实现，要求 palette count、透明语义、时间线与 oracle 一致，并另设感知差异阈值，不能放进 lossless suite。

Gifsicle 1.92 source 自带 11 个 `testie` 场景，包括 transparency expansion、background optimization、disposal、all-transparent、zero-width 和 warning handling；全部纳入回归。[official test directory](https://github.com/kohler/gifsicle/tree/v1.92/test)

### 4. PNG conformance

至少覆盖：

- PNGSuite 的 color type、bit depth、filter、Adam7 组合；
- ancillary chunks：text/iTXt/zTXt、ICC、EXIF、time、physical dimensions、C2PA、unknown safe/unsafe-to-copy；
- `tRNS`、sBIT、bKGD、hIST 与 palette reduction 交互；
- OptiPNG level 0 的 no-reduction/no-IDAT 特例；
- levels 1..7 的 valid PNG 像素 hash、metadata policy 和 interlace；
- 三个 reduction flag 的所有组合；
- interlaced true/false/null/undefined；
- APNG 的 frame count、delay、dispose/blend 和 loop；
- 官方 broken fixture 以及 truncated IDAT、bad CRC、missing PLTE/IEND、oversized chunks。

对 valid PNG，OptiPNG 与 Oxipng 输出不要求 byte equality，但必须解码为相同像素、bit/color reductions 不越过 option policy、interlace 与 metadata policy 一致。对 broken PNG，逐 fixture 记录 `repaired/rejected` 差分；若 Oxipng 不能安全修复而 OptiPNG 可以，应明确 fallback 或 rejection，不能返回损坏原图。

### 5. fuzz、性能与 N-API

- `cargo-fuzz` 覆盖 GIF pre-scan、`gif` streaming decoder、extension rewriter、delta calculator、Oxipng adapter；
- assertions：无 panic、abort、stack overflow、无限循环、越界和超预算分配；
- event-loop heartbeat 证明 GIF/PNG 工作位于 napi-rs `AsyncTask`；
- worker cancellation/timeout 后无 leaked child、thread 或临时文件；
- batch pipeline 验证 codec semaphore，避免 Oxipng Rayon 嵌套放大；
- 记录 input/output bytes、frame count、pixel work、wall time、peak RSS、engine 与 fallback reason；
- 在 Linux glibc/musl x64/arm64、macOS x64/arm64、Windows x64 上执行真实 binding smoke tests。

## 跨平台与发布风险

### legacy JS binaries

`gifsicle@5.3.0` 的 BinWrapper 仅列 macOS 单一 binary、Linux x86/x64、FreeBSD x86/x64、Windows x86/x64；没有 Linux ARM64 或 musl target，也没有明确 macOS ARM64 binary。miss 时 postinstall 需要 autoreconf/configure/make/toolchain 从源码构建。[platform mapping](https://github.com/imagemin/gifsicle-bin/blob/7d471d8bd4249452e1b4807525a2308936ee4f2f/lib/index.js)、[source build](https://github.com/imagemin/gifsicle-bin/blob/7d471d8bd4249452e1b4807525a2308936ee4f2f/lib/install.js)

`optipng-bin@7.0.1` 同样只有 legacy desktop/server targets；source fallback 使用 configure/make 和 system zlib。[platform mapping](https://github.com/imagemin/optipng-bin/blob/14f7065bdca9cb0bdc718a4a5b8ac982c8054f05/lib/index.js)、[source build](https://github.com/imagemin/optipng-bin/blob/14f7065bdca9cb0bdc718a4a5b8ac982c8054f05/lib/install.js)

因此两个 npm binary wrapper 都适合 CI oracle，不适合作为新项目默认运行时。native Rust engine 应随本项目统一的 napi-rs prebuild matrix 发布。

### WASM

- `gif`、`gif-dispose` 和 weezl 路径没有 CLI/文件系统依赖，适合作为未来单线程 WASM backend；需要关闭 N-API/Rayon 假设并复用同一 corpus。
- Oxipng 官方列出 jSquash/Squoosh 等 WASM 使用者，说明可移植性可行；本项目仍应为 wasm32 单独选择无 parallel/binary features 并验证 libdeflater 配置。
- external Gifsicle/OptiPNG subprocess 在 browser WASM 不可用；unsupported options 必须显式报告，而不是静默降级。

## 许可证 gate 调整

默认 MIT 发布闭包应：

1. `cargo-deny` 明确允许 MIT、Apache-2.0、Zlib 等已审核许可，并拒绝 GPL/AGPL；
2. 对 `license-file` crate 不能只标为 unknown 后人工放行，必须打开实际文件；`gifsicle` crate 就是典型例子；
3. npm audit 不能只信 package metadata。`gifsicle@5.3.0` 自报 MIT，但 vendored Gifsicle source 是 GPLv2；scanner 必须遍历 `vendor/source`、下载的 native binary notices 与 postinstall 来源；
4. SBOM 列出 Rust crates、编译进入 `.node` 的 C/asm、oracle binaries 和各自源码 commit/checksum；
5. 默认 npm/native tarball 测试断言不包含 `gifsicle`、Gifsicle C、gifski 或 optipng oracle binary；
6. 如果发布 exact GIF sidecar，使用单独 package/产物、清楚标为 GPL，并随产物提供对应许可证、首选修改源码和可复现 build scripts；发布方式需法律复核；
7. OptiPNG oracle 虽为 permissive zlib license，也要保留 attribution 和 vendored third-party notices。

调用用户自行安装的 GPL executable 通常比静态链接边界清晰，但是否构成单独作品仍应由法律审查确认。本报告不把“spawn 子进程”当作自动许可证豁免。

## Phase 2 验收门槛

### GIF

- 固定 `imagemin-gifsicle@7.0.0` + `gifsicle npm@5.3.0` + Gifsicle 1.92 oracle；
- 文档明确 README default O1 与真实 runtime no-O 的差异；
- non-GIF identity、Buffer error、三字节 detection、truthy argv 有契约测试；
- native-safe 完整保持 timeline、loop、disposal、transparency 和逐帧 RGBA；
- ordinary application extension 删除与 NETSCAPE loop 保留经过 fixture 验证；
- O1/O2/O3/colors 在未通过门禁前只走 configured external engine 或稳定拒绝；
- default MIT artifact 不含 GPL/AGPL code/binary；
- 输入、canvas、frame、extension、总像素和 timeout limits 全部可观测且不可绕过。

### OptiPNG

- 固定 `imagemin-optipng@8.0.0` + `optipng-bin@7.0.1` + OptiPNG 0.7.7 oracle；
- `StripChunks::All`、默认 `-i0`、默认 fix 和 null/undefined interlace 都有契约测试；
- level 0 正确禁用 reductions 与 IDAT recoding；
- level 7->Oxipng 6 明确标为 semantic mapping；
- repair/metadata/interlace required changes 不被 keep-original 回退；
- valid PNG/APNG 像素与动画语义 conformance 通过；
- broken PNG 逐项有 repaired/rejected policy 和稳定错误码；
- Oxipng max decompressed size、timeout 和 nested concurrency 生效。

## 最终决策

Phase 2 推荐组合为：

- **GIF exact truth source：** `imagemin-gifsicle@7.0.0` + `gifsicle@5.3.0` + Gifsicle 1.92；
- **GIF native core：** owned adapter 包装 `gif@0.14.2` + `gif-dispose@6.0.0`，先保守重编码，再逐级实现 delta；
- **GIF unsupported compatibility：** 用户配置的 external Gifsicle，或单独 GPL sidecar；默认 MIT 包不捆绑；
- **PNG exact truth source：** `imagemin-optipng@8.0.0` + `optipng-bin@7.0.1` + OptiPNG 0.7.7；
- **PNG native core：** 精确固定 `oxipng@10.1.1`，提供清楚标注的 semantic option mapping；
- **许可策略：** default closure 拒绝 GPL/AGPL，scanner 深入 vendored source/native artifacts，而不是相信 npm 顶层 `license` 字段。

这条路线让默认 binding 保持 permissive、内存安全和现代跨平台发布，同时不把“能重新编码 GIF/PNG”误写成“已经复刻 Gifsicle/OptiPNG”。精确兼容与原生覆盖率通过可观测 routing 和 conformance corpus 逐步收敛。
