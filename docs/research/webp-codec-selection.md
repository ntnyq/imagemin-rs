# Phase 5 WebP codec 选型与兼容性调研

更新日期：2026-07-17

## 结论

Phase 5 的 `webp()` 兼容入口应使用**项目自建、受限执行的 cwebp sidecar**，固定
`imagemin-webp@8.0.0` 的 JavaScript 行为以及 libwebp 1.2.1 的 CLI/codec 行为。进程边界
不是许可证要求，而是当前唯一同时满足以下目标的边界：

- 保留 cwebp 对 PNG、JPEG、TIFF、静态 WebP 的完整读取与转换链路；
- 精确复现 `-preset`、`-q`、lossless preset、crop/resize、metadata 与 CLI error；
- 把多格式 C decoder 的 crash、OOM、timeout 和恶意输入隔离在 Node/napi-rs 进程外；
- 允许每个 artifact 独立记录 codec version、source、build flags、SHA-256 与 SBOM。

**不能直接把 `cwebp-bin@8.0.0` 当作最终发布物。** 它只预置 macOS x64、Linux x86/x64
和 Windows x64 路径，失败后在安装机从 libwebp 1.2.1 source archive 本地编译；
`configure` 探测到的 libpng/libjpeg/libtiff/pthread 会改变可读格式与线程能力。该包也没有
提供把每个平台下载 binary、源提交、toolchain 与 flags 绑定起来的可复现 manifest。

Rust 原生路线推荐在独立的 semantic profile 中直接固定
[`libwebp-sys = "=0.14.4"`](https://crates.io/crates/libwebp-sys/0.14.4)，其 crate vendored
libwebp 1.6.0。它适合实现受验证的当前版 native codec，但不应替换 exact compatibility
oracle，也不能宣称与 libwebp 1.2.1 byte parity。高层
[`webp@0.3.1`](https://crates.io/crates/webp/0.3.1) 不适合作为兼容核心：它解析到
`libwebp-sys@0.9.6`/libwebp 1.3.1，输入、metadata、crop/resize 和 panic/error 语义都与
cwebp CLI 不同。

许可证允许静态链接：libwebp 1.2.1 是 BSD-3-Clause，并带独立 WebM patent grant；发布
sidecar 或静态 FFI 都必须同时分发 `COPYING`、`PATENTS` 和 attribution。npm/crate wrapper
声明的 MIT 不能替代 native codec 的许可证与专利 notice。本节不是法律意见，正式发布前
仍需完成组织级许可证与专利审查。

## 固定版本与证据

| 组件                | 固定版本 / 提交                                       | 已核验事实                                                                                          | 用途                            |
| ------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------- |
| `imagemin-webp`     | `8.0.0` / `88304e86aae79a1795de27ee6fe794788328184b`  | MIT；Node >=14.16；依赖 `cwebp-bin:^8.0.0`、`exec-buffer:^3.2.0`、`is-cwebp-readable:^3.0.0`        | JS API 与 argv oracle           |
| `cwebp-bin`         | `8.0.0` / `91dfc0009418539cb2dbdc90a10830c4c5e84028`  | MIT wrapper；macOS generic x64、Linux x86/x64、Windows x64；fallback source 为 1.2.1                | 历史 executable 分发基线        |
| libwebp             | `1.2.1`                                               | installed source archive SHA-256 `808b98d2f5b84e9b27fdef6c5372dac769c3bda4502febbfa5031bd3c4d7d018` | exact cwebp codec source        |
| `is-cwebp-readable` | `3.0.0` / `cee3fc84cb39755a4ba6052553247cf0010a565b`  | ISC；只放行 file-type 判为 `png`、`jpg`、`tif`、`webp` 的 Buffer                                    | 输入 routing oracle             |
| `exec-buffer`       | `3.2.0` / `46673a4fb776389b08fe38ef1cc420f79a97acb9`  | MIT；随机临时输入/输出文件，执行后读取输出并清理                                                    | temp-file/error oracle          |
| `webp` Rust wrapper | `0.3.1` / `56aaf8449984f9f0fa30dc6862a12d1010b75b3a`  | MIT OR Apache-2.0；依赖 `libwebp-sys ^0.9.3`；无 `rust-version`                                     | 被否决的高层兼容核心            |
| `libwebp-sys`       | `0.9.6` / `4007a323c1dcc4ad11d70ddadffc51ecfa1dbb5e`  | MIT wrapper；vendored libwebp 1.3.1；edition 2021；无 `rust-version`                                | `webp@0.3.1` 当前实际 native 层 |
| `libwebp-sys`       | `0.14.4` / `3a40281fd97537b693174acb7375d64d3b471a56` | MIT wrapper；vendored libwebp 1.6.0；edition 2024；默认 static build                                | 推荐 current native FFI 候选    |

主要一手来源：

- [`imagemin-webp@8.0.0` npm metadata](https://registry.npmjs.org/imagemin-webp/8.0.0)、[runtime](https://github.com/imagemin/imagemin-webp/blob/88304e86aae79a1795de27ee6fe794788328184b/index.js)、[README](https://github.com/imagemin/imagemin-webp/blob/88304e86aae79a1795de27ee6fe794788328184b/readme.md)、[tests](https://github.com/imagemin/imagemin-webp/blob/88304e86aae79a1795de27ee6fe794788328184b/test.js)
- [`cwebp-bin@8.0.0` npm metadata](https://registry.npmjs.org/cwebp-bin/8.0.0)、[platform mapping](https://github.com/imagemin/cwebp-bin/blob/91dfc0009418539cb2dbdc90a10830c4c5e84028/lib/index.js)、[fallback install](https://github.com/imagemin/cwebp-bin/blob/91dfc0009418539cb2dbdc90a10830c4c5e84028/lib/install.js)、[vendored libwebp 1.2.1 archive](https://github.com/imagemin/cwebp-bin/blob/91dfc0009418539cb2dbdc90a10830c4c5e84028/vendor/source/libwebp-1.2.1.tar.gz)
- [`is-cwebp-readable@3.0.0` runtime](https://github.com/shinnn/is-cwebp-readable/blob/cee3fc84cb39755a4ba6052553247cf0010a565b/index.js)
- [`exec-buffer@3.2.0` runtime](https://github.com/kevva/exec-buffer/blob/46673a4fb776389b08fe38ef1cc420f79a97acb9/index.js)
- [libwebp 1.2.1 `cwebp.c`](https://github.com/webmproject/libwebp/blob/v1.2.1/examples/cwebp.c)、[encode API](https://github.com/webmproject/libwebp/blob/v1.2.1/src/webp/encode.h)、[image reader dispatch](https://github.com/webmproject/libwebp/blob/v1.2.1/imageio/image_dec.c)、[WebP reader](https://github.com/webmproject/libwebp/blob/v1.2.1/imageio/webpdec.c)
- [libwebp 1.2.1 `COPYING`](https://github.com/webmproject/libwebp/blob/v1.2.1/COPYING)、[`PATENTS`](https://github.com/webmproject/libwebp/blob/v1.2.1/PATENTS)
- [`webp@0.3.1` release source](https://docs.rs/crate/webp/0.3.1/source/)、[`libwebp-sys@0.9.6` release source](https://docs.rs/crate/libwebp-sys/0.9.6/source/)、[`libwebp-sys@0.14.4` release source](https://docs.rs/crate/libwebp-sys/0.14.4/source/)

`imagemin-webp` 的 dependency ranges 本身不是完整 oracle。conformance 环境必须把完整
lockfile 和 npm tarball integrity 一起归档；否则 `file-type` detector 或任一 caret
dependency 升级都可能改变 routing/error 行为。

本次核验的 npm integrity 分别是：`imagemin-webp@8.0.0`
`sha512-yN6kNKir6T/U3AtP3uLHrLn9XYafk2m49EbUqLCQ3GPRRLRs+4pUQxxaHz+lnTDM+LQpkSjGQaFVcSgYqvW3dQ==`，
`cwebp-bin@8.0.0`
`sha512-j2s6jA84aG20lB0i/FBwqZGc8nHx4VASUK8OTDxy3xoUHoX/+pP6T15/TnWwhMcD0pZ05y5GgRPkurufOC8tnQ==`。

## `imagemin-webp@8.0.0` 的真实契约

### 工厂、输入与返回值

公开形状是：

```ts
type ImageminWebp = (options?: WebpOptions) => (input: Buffer) => Promise<Buffer>;
```

实际 runtime 行为如下：

- `input` 必须是 Node `Buffer`，普通 `Uint8Array` 不接受。类型错误消息包含实际
  `typeof input`。
- `is-cwebp-readable` 只把 file-type 识别出的 PNG、JPEG、TIFF 与 WebP 交给 cwebp；
  BMP、GIF、SVG、AVIF 和任意其他输入原样返回，而且返回的是**同一个 Buffer 引用**。
- 不可读格式在读取 options 前就 pass-through；因此 invalid options 对非目标格式不报错。
- factory 的默认参数只处理 `undefined`；显式 `null` 对非目标格式仍 pass-through，对目标输入
  则在读取 property 时失败。
- signature 看起来属于目标格式、但内容损坏时会进入 cwebp 并拒绝，不会静默返回原文件。
- 成功返回从临时输出文件读出的新 Buffer。child 失败时，若 stderr 非空，wrapper 会用
  stderr 覆盖原 error message。

上游测试只有三类：PNG 转成更小的 WebP、BMP identity pass-through、损坏 WebP 报
`BITSTREAM_ERROR`。它没有覆盖 options 边界、animation、metadata、TIFF、crop/resize、
平台差异或资源上限，因此本项目不能把这三项测试当作充分兼容证据。

### argv 与 JavaScript truthiness

每个目标输入都固定从下面参数开始：

```text
-quiet -mt
```

`-mt` 总是打开 cwebp 内部多线程。后续参数顺序也是契约：preset 最先，其次 quality、
alpha quality、method、target size、SNS、filter、auto filter、sharpness、lossless、near
lossless、crop、resize、metadata，最后是 `-o <output> <input>`。preset 必须在其他编码
参数前，因为 cwebp 的 preset 会覆盖先前 config；上游顺序恰好保证显式字段最终胜出。

| option         | README/default                                       | runtime argv 与兼容陷阱                                                             |
| -------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `preset`       | `default`; `default/photo/picture/drawing/icon/text` | truthy 时 `-preset value`                                                           |
| `quality`      | 75；0..100                                           | truthy 时 `-q value`；**0 被遗漏**并回到 CLI 默认 75                                |
| `alphaQuality` | 100；0..100                                          | truthy 时 `-alpha_q value`；**0 被遗漏**                                            |
| `method`       | 4；0..6                                              | truthy 时 `-m value`；**0 被遗漏**并回到 4                                          |
| `size`         | 未设置；bytes                                        | 仅 `> 0` 时 `-size value`；cwebp 会把 passes 从默认 1 提升到 6                      |
| `sns`          | 50；0..100                                           | truthy 时 `-sns value`；**0 被遗漏**                                                |
| `filter`       | README 未准确给出 CLI 默认；0..100                   | truthy 时 `-f value`；0 被遗漏；libwebp 1.2.1 默认是 60                             |
| `autoFilter`   | false                                                | truthy 时 `-af`                                                                     |
| `sharpness`    | 0；0..7                                              | truthy 时 `-sharpness value`；0 被遗漏，但等于 CLI 默认                             |
| `lossless`     | false 或 preset 0..9                                 | truthy number 时 `-z N`，其他 truthy 时 `-lossless`；**numeric 0 被遗漏**           |
| `nearLossless` | 100；0..100                                          | truthy 时 `-near_lossless N`，并强制 lossless；**0 被遗漏**                         |
| `crop`         | `{x,y,width,height}`                                 | truthy object 时 `-crop x y width height`                                           |
| `resize`       | `{width,height}`                                     | truthy object 时 `-resize width height`，执行顺序在 crop 之后                       |
| `metadata`     | `none`                                               | truthy string，或 array `.join(',')` 后传 `-metadata`; 支持 `all/none/exif/icc/xmp` |

顶层没有 runtime schema。truthy 字符串、负数、越界数字等会被直接转为 argv，再由 CLI
决定 error；错误 crop/resize object 还可能先产生 JavaScript property/array error。兼容
层不能把这些行为误写成“所有字段都已严格验证”。推荐在项目的 typed API 中提供严格
类型，但 exact JS entry 的差分测试必须保留 absent、0、false、空字符串、NaN、越界与
错误类型 matrix。

### libwebp 1.2.1 默认配置

cwebp 初始化的关键默认值是：lossless 关闭、quality 75、method 4、segments 4、SNS 50、
filter strength 60、filter sharpness 0、alpha compression 1、alpha filtering 1、alpha
quality 100、passes 1、near lossless 100、`exact` 关闭。WebP 单边最大尺寸是 16,383。

numeric `lossless` 使用 `-z 0..9` preset；单独 `-z` 的内部默认 preset 是 6。`-size`
要求以目标大小驱动多 pass。所有这些都属于 cwebp/libwebp 1.2.1 行为，而不是稳定的
WebP 格式规则；升级 codec 后只能重新建立 semantic/visual profile，不能沿用 byte
compatibility 声明。

## 输入格式、动画与输出路径

### 实际接受的格式

libwebp 1.2.1 的 image reader 能识别 PNG、JPEG、TIFF、WebP 与 PNM P5/P6/P7；各 reader
还取决于构建时依赖。Windows WIC build 可能读取更多系统格式。但 `imagemin-webp` 在
调用 cwebp 前只放行：

| 输入             | imagemin routing   | cwebp 行为                               | Phase 5 契约                                              |
| ---------------- | ------------------ | ---------------------------------------- | --------------------------------------------------------- |
| PNG              | encode             | 读取 pixels，按需提取 metadata           | 支持静态 PNG                                              |
| JPEG             | encode             | 读取 pixels，按需提取 metadata           | 支持静态 JPEG，测试 CMYK/progressive/orientation          |
| TIFF             | encode             | 读取 pixels，按需提取 metadata           | 支持；多 IFD/tiles/endianness 必须列入 corpus，不预设语义 |
| WebP             | decode + re-encode | 默认 quality 75，绝非 identity optimizer | 只支持经 preflight 证明为静态的 WebP                      |
| PNM/WIC 其他格式 | helper 拦截        | cwebp 本可读取部分格式                   | identity pass-through，以 imagemin 为准                   |

所有成功输出都是 WebP。Buffer API 不负责文件名；file/pipeline API 必须原子地把扩展名改为
`.webp`，并显式定义目标文件冲突策略，不能把 WebP bytes 写回 `.png`/`.jpg` 路径。

### 动画策略

cwebp 1.2.1 帮助与 source 明确警告 animated PNG/WebP 不受支持。依赖 decoder 恰好取首帧
或返回某个错误，会造成不可接受的静默 staticize。因此 Phase 5 在 child 启动前必须解析
container feature：

- APNG：默认 identity pass-through，或返回稳定的 `ERR_WEBP_ANIMATION_UNSUPPORTED`；
- animated WebP：默认 identity pass-through，或返回相同 typed error；
- GIF：本来就被 input detector 拦截；
- 禁止把“成功生成一张静态 WebP”解释为动画支持。

pass-through 与 typed error 需要在 public contract 中二选一并保持稳定。为了贴近 imagemin
对非适用输入的 no-op 风格，推荐默认 pass-through，同时在 strict pipeline policy 下允许
error；无论哪种都必须保留可观测 diagnostic，不能静默取默认帧。

## metadata、alpha、crop 与 resize

### metadata policy

默认没有 `-metadata`，因此 cwebp 不复制 ICC、EXIF 或 XMP。显式 `all`/list 时，它复制
对应 payload；这不是 metadata normalization：

- crop/resize 后，EXIF 中的 width/height、thumbnail 与 orientation 可能过时；
- encoder 不会因为 EXIF orientation 自动旋转像素；
- 保留 ICC 不代表所有 platform reader 的色彩转换完全相同；
- libwebp 1.2.1 的 Windows WIC reader 对 metadata 能力有额外限制，source 注明只支持 ICC
  extraction，不能假设 EXIF/XMP 与 Unix dependency build 相同；
- metadata chunk 自身也可能成为内存、解析时间和隐私风险。

exact profile 保留 upstream `none/all/exif/icc/xmp` 的 raw-copy 语义。新的 native profile
若要自动 orientation 或重写 dimensions，必须使用不同 API/diagnostic；不能在同一
`webp()` compatibility claim 中暗改。

### crop/resize 与 alpha

cwebp 先完整读取和解码输入，再 crop，最后 resize。crop 因此不会降低 decoder 峰值内存。
本项目应在执行前验证 crop 坐标、范围、整数性以及 resize 推导后的尺寸与 pixels，不能等
codec OOM 后才报告。

resize 处理 alpha 时可能经过 premultiplied representation。libwebp 1.2.1 默认 `exact=0`，
会丢弃 alpha=0 像素下不可见的 RGB；`imagemin-webp` 没有暴露 cwebp 的 `-exact`。因此：

- lossless 只能承诺可见颜色与 alpha 的解码语义，不能承诺隐藏 RGB bit equality；
- lossy visual metric 必须把输出分别合成到黑、白和 checkerboard 背景后测量；
- crop/resize conformance 必须证明顺序是 crop-first，并单独覆盖半透明边缘与全透明像素。

## sidecar 与 Rust FFI 比较

| 方案                         | exact 兼容                      | 输入/metadata                                                                 | 故障隔离         | 构建与平台风险                                            | 决策                       |
| ---------------------------- | ------------------------------- | ----------------------------------------------------------------------------- | ---------------- | --------------------------------------------------------- | -------------------------- |
| 项目自建 cwebp 1.2.1 sidecar | 同 artifact/OS 可做 byte oracle | 复用 cwebp 的 PNG/JPEG/TIFF/WebP、metadata、crop/resize                       | process boundary | 需维护旧版本 patch、reader deps 与多平台 artifact         | `webp()` 采用              |
| 原始 `cwebp-bin@8`           | 当前命中 binary 时接近上游      | fallback 能力随宿主依赖漂移                                                   | process boundary | x86-centric；无 arm64/musl manifest；install-time compile | 仅开发 oracle，不发布      |
| `webp@0.3.1`                 | 否；底层 libwebp 1.3.1          | 主要接收 RGB/RGBA；image integration 不还原 cwebp metadata/reader             | addon 内         | convenience encode path 有 unwrap/panic；无明确 MSRV      | 不作为兼容核心             |
| `libwebp-sys@0.14.4` static  | 否；底层 libwebp 1.6.0          | raw encode/decode/mux 足够，但调用方要另建输入 decoder、metadata、crop/resize | addon 内         | unsafe、C toolchain、CPU flags、cross build；edition 2024 | 推荐 future native profile |
| system dynamic libwebp       | 否                              | API 能力随系统 libwebp                                                        | addon 内         | runtime version 与 distro security updates 漂移           | 不用于可重复 npm artifact  |

### 为什么高层 `webp` crate 不够

`webp@0.3.1` 默认启用 `image` integration，但核心 encoder 接受的是 raw RGB/RGBA。它不会
自动复现 cwebp 的 PNG/JPEG/TIFF reader、metadata extraction/copy、crop-first resize、
CLI error 文本或临时文件行为。普通 `encode()`/lossless convenience path 内部使用
`unwrap`，而 `encode_advanced` 虽能接收 `WebPConfig` 并返回 error，仍需要调用方自己
构造完整 picture、mux 和资源策略。它的 `libwebp-sys ^0.9.3` 当前解析到 0.9.6，vendored
codec 已是 1.3.1，所以从版本上也不可能与 1.2.1 保持 byte parity。

crate 内已有独立 animation encoder/decoder API，但普通 decoder 会拒绝动画。引入这些 API
不会使 `imagemin-webp@8` 突然支持动画；动画应该是未来单独设计、具有 timeline/disposal/
loop tests 的入口。

### 推荐 direct FFI 的约束

若开发 current native profile，固定 `libwebp-sys = "=0.14.4"`，不要打开
`system-dylib`，也不要默认开启 target-universal artifact 无法保证的 `sse41`/`avx2`。
该 crate 的 build script 会编译整个 vendored `src/**/*.c` 和 sharpyuv；默认 `std` 打开
libwebp thread support，`parallel` 只加速 C source 编译，不代表 runtime 一定多线程。

需要特别记录：

- crate 没有声明 `rust-version`，但 edition 2024 实际要求支持该 edition 的 Rust toolchain；
- build script 根据 `TARGET_CPU`/target features 传 `-march` 并选择 SSE/NEON/AVX source；
  release CI 必须固定这些输入，不能让开发机 CPU 污染通用 npm artifact；
- README 明示强开 SSE4.1、AVX2 或不适用的 NEON 可能在旧 CPU 上 crash；
- static linking 在法律上可行，但仍要携带 vendored `COPYING` 与 `PATENTS`；
- native decoder/encoder 的 crash、UB 与峰值内存会发生在 Node host 内，必须把 fuzzing、
  `catch_unwind` 边界和 worker resource policy 当成发布条件；`catch_unwind` 不能捕获 C crash。

当前 native profile 建议只作为内部实验或显式不同的入口，不在 `webp()` 上提供公开
`engine: 'native' | 'compat'`。同一个公开 options 在两个 engine 中得到不同 bytes、metadata
或 errors，会让缓存和复现不可控。engine routing 应属于 build/runtime descriptor，并在
diagnostic 中报告：

```ts
interface WebpDiagnostics {
  engine: "cwebp-1.2.1-sidecar" | "libwebp-1.6.0-native";
  compatibility: "exact-artifact" | "semantic";
  codecVersion: string;
  artifactSha256: string;
}
```

## 许可证、PATENTS 与 provenance

libwebp 1.2.1 `COPYING` 是 Google 的 BSD-3-Clause license。`PATENTS` 提供针对 WebM
implementation 的永久、全球、royalty-free patent grant，并包含在特定 patent litigation
情形下终止的条款。推荐的交付闭包是：

1. 每个 sidecar/native npm artifact 携带原始 `COPYING`、`PATENTS` 和项目 attribution；
2. `THIRD_PARTY_NOTICES` 区分 JavaScript/Rust wrapper 的 MIT 与 native libwebp 的
   BSD-3-Clause/patent grant；
3. 记录 libpng/libjpeg/libtiff/zlib 及 build toolchain 的各自 license/notice；
4. 发布 source commit/archive SHA-256、所有 patch、compiler、linker、flags 与 dependency
   versions；
5. 生成 CycloneDX/SPDX SBOM，并把最终 binary SHA-256 写入 npm package manifest；
6. CI 从最终 npm tarball 解包，运行 `cwebp -version` 并核对预期 version/hash；
7. 禁止运行时下载 binary，禁止 install-time 自动 fallback compile。

`cwebp-bin@8` 包含的 `libwebp-1.2.1.tar.gz` 能证明 fallback source 的版本和 archive hash，
但不能证明各 GitHub prebuilt binary 一定由该 source、相同 toolchain 和相同 flags 构建。
所以“npm 包版本相同”不是 source provenance，也不能推出跨平台字节相同。

libwebp 1.2.1 是历史 codec。发布 exact sidecar 前必须针对项目实际 patch set 完成漏洞扫描、
malformed corpus 与组织级安全接受。若安全修复会改变 output，应同时更新 artifact fingerprint
与 conformance baseline；如果无法安全分发，就暂停 exact profile，不能为了兼容声明继续
发布未经审查的旧 binary。

## 平台与可重复性矩阵

`cwebp-bin@8.0.0` 的静态 mapping 是：

| 平台    | wrapper 预置路径                                                              | 主要缺口                                               |
| ------- | ----------------------------------------------------------------------------- | ------------------------------------------------------ |
| macOS   | 单一 `vendor/osx/cwebp`；样本 header 为 x86_64，未验证完整 version/provenance | Apple Silicon 需要 Rosetta 或 fallback source build    |
| Linux   | x86 与 x64                                                                    | 无 arm64；未区分 glibc/musl；fallback reader deps 漂移 |
| Windows | x64                                                                           | 无 x86/arm64；WIC 与 Unix reader/metadata 能力可能不同 |

Phase 5 自建 artifact 至少覆盖 darwin arm64/x64、linux gnu arm64/x64、linux musl
arm64/x64、Windows x64。若产品矩阵缩小，必须在安装前给出明确 unsupported-platform error，
不能下载未知 binary 或在用户机器静默编译。

同一 libwebp version 也不自动保证跨平台 byte equality。CPU dispatch、compiler、reader
library 与 `-mt` 都可能引入差异。推荐把兼容声明分成两层：

- `exact-artifact`：相同 binary SHA-256、相同 options/input 下要求逐字节一致；
- `semantic`：不同平台 artifact 或 native profile 只承诺结构、metadata 与 visual thresholds。

重复运行必须覆盖 `-mt`、不同 worker 并发和支持矩阵内的 CPU。只有同一 artifact 10 次输出
完全一致后，才能把其 bytes 用于 content-addressed cache；跨 codec version/build 的 cache key
必须包含 engine、codec version、artifact hash、options 与 input hash。

## 安全与资源边界

历史 `exec-buffer` 把完整 input 写入随机 temp path，child 写完整 output，再读回内存；没有
timeout、input/output cap 或 decoder memory budget。cwebp 还会同时持有 compressed input、
decoded picture、crop/resize working buffers、metadata 与 encoded output。推荐统一 runner 固定：

| 边界                           |           Phase 5 默认上限 | 说明                                                |
| ------------------------------ | -------------------------: | --------------------------------------------------- |
| compressed input               |                    256 MiB | 进入 detector 前检查                                |
| width / height                 |                     16,383 | 不超过 WebP codec hard limit                        |
| decoded pixels                 | 67,108,864（64 Mi pixels） | 在 PNG/JPEG/TIFF/WebP header preflight 后检查       |
| per-job decoded working budget |                    512 MiB | crop/resize 需按多份 RGBA buffer 估算，超限提前拒绝 |
| encoded output                 |                    512 MiB | child 写入期间实时限制，不等读完才检查              |
| metadata chunk / total         |             8 MiB / 16 MiB | 防止恶意 ICC/EXIF/XMP 膨胀                          |
| stderr                         |                      1 MiB | 超限截断并保留稳定 diagnostic                       |
| wall time                      |                      120 s | timeout 后终止整个 process tree                     |
| temporary disk                 |              768 MiB / job | 包含 input、partial output 与 cleanup reserve       |

runner 使用 mode 0700 的私有 `mkdtemp`，在其中用 exclusive create 创建 input/output；成功、
失败、取消和 signal 都清理。写 output 时不跟随 symlink；最终路径用同文件系统 atomic rename。

PNG/APNG、JPEG SOF、TIFF IFD 与 WebP RIFF/VP8X preflight 必须使用 checked arithmetic，并给
parser 自身设置 segment/chunk/depth limit。TIFF compressed bomb、循环 IFD、巨型 metadata、
truncated RIFF 与声明尺寸不符都应在 adversarial corpus 中。preflight 不是完整 decoder，识别
成功后仍必须把 codec 非零退出映射为稳定 typed error。

由于每个 child 固定 `-mt`，外层不能再按逻辑 CPU 数无限启动进程。初始并发建议：

```text
maxJobs = min(max(floor(availableParallelism / 2), 1), 4)
```

并再受全局 decoded-memory semaphore 限制。最终值由 1/2/4/8 jobs 压测决定；吞吐提升不足
但 RSS/尾延迟明显变差时，选择较低并发。

## conformance 与 benchmark release gate

### Oracle 与 corpus

exact oracle 必须在隔离环境固定：

- `imagemin-webp@8.0.0` tarball/integrity 与完整 lockfile；
- `cwebp-bin@8.0.0` wrapper source；
- 项目自建 cwebp 1.2.1 artifact SHA-256；
- OS/arch、compiler/linker、reader library、flags 与 locale。

项目自建 artifact 必须同时注入上游 `imagemin-webp` oracle 与本项目 runner；只有两边实际执行
同一 binary SHA-256 时，逐字节差分才能证明 wrapper/argv compatibility。若拿自建 artifact
直接与历史 npm prebuilt 比，差异也可能来自 toolchain/flags，不能先归因于 Rust/Node wrapper。

首个 release corpus 至少 500 个合法样本，并附来源、许可证与 SHA-256：

| 格式 | 最少样本 | 必含特征                                                                        |
| ---- | -------: | ------------------------------------------------------------------------------- |
| PNG  |      150 | palette/gray/RGB/RGBA、1/2/4/8/16-bit、interlace、ICC/EXIF/XMP、APNG            |
| JPEG |      150 | gray/YCbCr/CMYK、baseline/progressive、subsampling、orientation、ICC、truncated |
| TIFF |       75 | little/big endian、strip/tile、uncompressed/LZW/deflate、alpha、多 IFD          |
| WebP |      125 | lossy/lossless、alpha、extended chunks、ICC/EXIF/XMP、animation、corrupt RIFF   |

另外维护至少 250 个 malformed/adversarial samples：dimension bombs、metadata bombs、重复/
乱序/overlap chunks、循环 TIFF IFD、零长 input、边界 16,383 与 codec error enum。

### option matrix

至少覆盖：

- preset 六种取值与显式字段覆盖 preset 的顺序；
- quality/alphaQuality 的 absent、0、1、50、75、100 与 invalid truthy；
- method 0..6，SNS/filter/sharpness 的 0/default/max；
- lossless false/true/0..9，nearLossless 0/1/60/100；
- target size、autoFilter；
- crop 边界、crop+resize 顺序、resize 单边 0/保持比例与超限；
- metadata none/all/exif/icc/xmp/array；
- static WebP re-encode、unsupported identity、malformed target-format error。

exact compatibility 对同一 artifact 要求：合法静态输入逐字节相同，unsupported input 保持同一
Buffer identity，错误属于同一 stderr/error class。项目 sidecar 改用更安全的 temp directory
实现后，不要求随机 temp path 相同，但 argv、output 与 observable error 必须等价。

### 视觉与结构阈值

current native profile 与不同平台 artifact 只能做 semantic comparison：

- lossless：尺寸、alpha 与所有可见 RGBA 完全相同；alpha=0 下隐藏 RGB 不作 equality 声明；
- lossy：独立 decoder 转 linear RGBA，分别合成黑、白、checkerboard 后计算 DSSIM 与
  CIEDE2000；alpha 单独计算 MAE/max error；
- 建议准入线为 DSSIM 不劣于 `max(oracle × 1.10, oracle + 0.0005)`，ΔE00 mean 不劣于
  oracle + 0.2、p95 + 0.75、p99 + 1.5，alpha MAE 不劣于 oracle + 0.5/255；
- crop/resize 必须匹配输出尺寸、crop-first 顺序与半透明边缘 reference；
- `metadata:none` 要求目标 chunks 不存在，显式 copy 要求 payload byte equality；
- animated input 必须 pass-through 或 typed error，绝不允许只比较导出的第一帧。

这些阈值是首轮 gate，不是永久标准。corpus baseline 固定后按 false positive/negative 调整，
所有调整都要保留 ADR 和 before/after 数据。

### 性能、确定性与故障测试

benchmark 记录 wall time、CPU time、peak RSS、temp bytes、output bytes 和 spawn overhead，按
0.1/1/8/32/128 MiB 与透明/不透明、lossy/lossless、crop/resize 分桶。native experimental
profile 的 p95 output size 不得超过 oracle 105%，任何样本不得超过 120%，除非有显式
quality/metadata justification。

每个 fixed build 对同一 input/options 重复 10 次，并覆盖 cold/warm、1/4 jobs 与支持的 CPU。
相同 artifact 必须 byte deterministic 才能声明 exact；如果 `-mt` 或 CPU path 产生多个
hash，发布说明必须降级为 semantic，并禁止使用未包含 platform/build fingerprint 的 cache。

故障门包括 timeout、cancel、child signal/crash、EPIPE、output/stderr/temp disk 超限、部分
output、cleanup failure、worker shutdown 与 1000-job 压力。Node 主进程必须保持可用，临时
目录最终为空，错误不能泄漏用户绝对路径或未截断的 codec stderr。

## 分阶段执行建议

### 5A：建立 exact oracle

1. 固定 npm tarball、完整 lockfile 与 libwebp 1.2.1 source hash。
2. 把 truthiness、argv 顺序、input routing、identity/error 写入 fixture manifest。
3. 构建 ≥500 legal + ≥250 adversarial corpus，先跑历史 oracle，不改公开 API。

### 5B：自建 sidecar

1. 固定 libpng/libjpeg/libtiff/zlib source 与 flags，自建目标平台 cwebp 1.2.1。
2. 接入统一受限 runner、format/animation/dimension preflight 与 `.webp` path policy。
3. 通过 exact-artifact conformance、provenance、许可证、安全扫描和 tarball smoke 后发布
   `webp()`。

### 5C：current native prototype

1. 固定 `libwebp-sys@0.14.4` 与 Rust/C toolchain，先实现 raw static WebP encode/decode。
2. 选择并固定 PNG/JPEG/TIFF decoder，逐项实现 metadata、crop/resize 与 error mapping。
3. 只报告 semantic diagnostics；通过 visual/metadata/resource/fuzz gate 前不对外承诺。

### 5D：是否公开 native profile

只有在 native 路线证明明显降低 artifact/性能成本，且所有支持平台通过 semantic gate 后，
才为它设计独立公开入口和 SemVer。不要在没有数据时自动把 `webp()` 从 1.2.1 sidecar 切换到
1.6.0 FFI。

## 最终推荐

1. **现在实现：** `webp()` 使用项目自建、hash-pinned、无安装时 fallback 的 cwebp
   1.2.1 sidecar；它是 imagemin-webp 8 的 exact compatibility 路线。
2. **现在拒绝：** 直接发布 `cwebp-bin@8` 下载物，或以 system libwebp 作为默认 runtime。
3. **实验候选：** direct `libwebp-sys@0.14.4`/libwebp 1.6.0，作为独立 semantic native
   prototype；不使用 `webp@0.3.1` 作为兼容核心。
4. **发布阻塞项：** libwebp 1.2.1 安全接受、全平台自建 provenance、COPYING/PATENTS/
   dependency notices、animation preflight、资源 runner、500+250 corpus 与确定性/视觉门禁。
5. **声明边界：** 只能对固定 binary hash 声明 byte compatibility；不同平台、codec version
   或 native engine 只声明经过测试的 semantic/visual compatibility。
