# Phase 6 AVIF codec 选型与兼容性调研

更新日期：2026-07-17

## 结论

Phase 6 的 `avif()` 入口推荐采用**项目自建、受资源限制的当前 Sharp child-process
sidecar**。首个生产版本固定 `sharp@0.35.3` 及每个目标平台实际解析到的 `@img/sharp-*`
与 `@img/sharp-libvips-*` artifact，在 child 内直接调用 Sharp，不执行
`imagemin-avif@0.1.6` 的 runtime。这样可以保留 Sharp 成熟的多格式解码、色彩和 alpha
管线，同时把 libvips、libheif、libaom 的 crash、OOM、线程膨胀和 hard timeout 隔离在
Node/napi-rs 主进程之外。

`imagemin-avif@0.1.6` 及它当前解析出的历史链路
`sharp@0.33.5 -> libvips 8.15.3 -> libheif 1.18.2 -> libaom 3.9.1` 只能作为**离线差分
oracle**，不能进入处理不可信输入的生产路径。除了上游 wrapper 本身存在全局 options
污染、`speed` 完全失效和异步错误被 `ReferenceError` 覆盖之外，libheif 1.18.2 还明确落入
[CVE-2026-32740](https://nvd.nist.gov/vuln/detail/CVE-2026-32740) 的默认解码 heap
越界写影响范围；进程隔离可以收窄 blast radius，但不能把已知可利用 native 漏洞变成可接受
的生产依赖。

因此本阶段兼容目标必须写成：

- API 形状与文档语义兼容，而不是复制 wrapper 的 bug；
- 静态图片的 semantic/visual compatibility，而不是跨版本、跨平台 byte parity；
- 固定输入、options、平台 artifact 与执行策略后，可复验且可追溯；
- 动画、多页和未知格式做 identity no-op，不允许 Sharp 默认取首帧后静默 staticize；
- 默认剥离 metadata，保持历史 Sharp 行为；
- `speed` 按文档真正生效，并按两端点比例映射到 Sharp `effort`；同时公开 Sharp 原生
  `effort`，二者互斥；
- compatibility output 明确固定 8-bit；保留上游 lossless 默认 chroma 4:2:0，但不把
  `lossless + 4:2:0` 宣称为 RGB pixel lossless。

direct Sharp in host 不推荐：Sharp 的 cache、concurrency 与 native state 是进程级共享状态，
libaom 线程不受 `sharp.concurrency()` 完全控制，native crash 会终止整个 Node/napi-rs 宿主，
Sharp 自身 timeout 也不是完整的 CPU/RSS/process-tree hard limit。

未来可以增加两个显式 experimental engine：当前 `libavif`/AOM sidecar 用于更精细的
bit depth、chroma、alpha 和 jobs 控制；`ravif@0.13.0` 用于纯 Rust 静态 AVIF。二者都不应
冒充 Sharp 兼容核心。`libavif-sys@0.17.0+libavif.1.0.4` 绑定的 libavif 过旧，不应选作
Phase 6 production FFI。

许可证方面，sidecar 边界不会消除 native 依赖的分发义务。Sharp 是 Apache-2.0；本次核验
的 `@img/sharp-libvips-*` manifest 声明 LGPL-3.0-or-later，Windows combined platform
package 则声明 Apache-2.0 AND LGPL-3.0-or-later；包内 libvips、libheif、libaom 及其他
decoder/support library 各有自己的许可证。发布前必须归档完整平台 licensing manifest、
对应源码/offer、构建信息与 AOM patent text，并完成组织级法律审查。本节不是法律意见。

## 固定版本与证据

### 历史 compatibility oracle

| 组件                   | 固定版本 / 提交                                       | 已核验事实                                                      | 用途                                 |
| ---------------------- | ----------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------ |
| `imagemin-avif`        | `0.1.6` / `b106078cadfde3df63b57d5f232941bfeedeae68`  | MIT；声明 Node >=10；依赖 `sharp:^0.33.2`、`plugin-error:1.0.1` | API、默认值与 bug oracle             |
| `sharp`                | `0.33.5` / `fc32e0bd3f9111b80cf078df7b0cfc355695674e` | Apache-2.0；实际要求 Node 18.17+、20.3+ 或 21+                  | 当前 caret 解析的历史 image pipeline |
| `@img/sharp-libvips-*` | `1.0.4`，部分平台为 `1.0.5`                           | manifest 为 LGPL-3.0-or-later；每个平台必须独立核验             | 历史 prebuilt native artifact        |
| libvips                | `8.15.3`                                              | Sharp 0.33.5 prebuilt 基线                                      | decode、colour、HEIF save pipeline   |
| libheif                | `1.18.2`                                              | LGPL-3.0 library；受多个 2026 CVE 影响                          | AVIF container/codec bridge          |
| libaom                 | `3.9.1`                                               | BSD-2-Clause + AOM Patent License 1.0                           | AV1 encode/decode                    |

`imagemin-avif@0.1.6` 的 npm integrity 是
`sha512-ItteHJ1xhC3QzlabVKmwSLmp2D9OlSaRmeEwmtK3+MPAo0fFsJX0ZzFBgTFAKuZNEqq7TSmgsg8MxxQ1745cuw==`；
本次下载 tarball 的 SHA-512 hex 是
`22db5e1c9d71842dd0ce569b54a9b048b9a9d83f4e95269199e1309ad2b7f8c3c0a347c5b095f46731418131402ae64d12aabb4d29a0b20f0cc71435ef8e5cbb`。
`sharp@0.33.5` 的 npm integrity 是
`sha512-haPVm1EkS9pgvHrQ/F3Xy+hgcuMV0Wm9vfIBSiwZ05k+xgb0PkBQpGsAA/oWdDobNaZTH5ppvHtzCFbnSEwHVw==`。

主要一手来源：

- [`imagemin-avif@0.1.6` npm metadata](https://registry.npmjs.org/imagemin-avif/0.1.6)、[runtime](https://github.com/delfimov/imagemin-avif/blob/b106078cadfde3df63b57d5f232941bfeedeae68/index.js)、[package manifest](https://github.com/delfimov/imagemin-avif/blob/b106078cadfde3df63b57d5f232941bfeedeae68/package.json)、[README](https://github.com/delfimov/imagemin-avif/blob/b106078cadfde3df63b57d5f232941bfeedeae68/README.md)、[唯一测试](https://github.com/delfimov/imagemin-avif/blob/b106078cadfde3df63b57d5f232941bfeedeae68/test.js)
- [`sharp@0.33.5` npm metadata](https://registry.npmjs.org/sharp/0.33.5)、[AVIF output wrapper](https://github.com/lovell/sharp/blob/fc32e0bd3f9111b80cf078df7b0cfc355695674e/lib/output.js)、[constructor](https://github.com/lovell/sharp/blob/fc32e0bd3f9111b80cf078df7b0cfc355695674e/lib/constructor.js)、[native output pipeline](https://github.com/lovell/sharp/blob/fc32e0bd3f9111b80cf078df7b0cfc355695674e/src/pipeline.cc)
- [libvips 8.15.3 `heifsave.c`](https://github.com/libvips/libvips/blob/v8.15.3/libvips/foreign/heifsave.c)
- [libheif 1.18.2 AOM encoder](https://github.com/strukturag/libheif/blob/v1.18.2/libheif/plugins/encoder_aom.cc)、[libheif 1.18.2 `COPYING`](https://github.com/strukturag/libheif/blob/v1.18.2/COPYING)
- [AOM Patent License 1.0](https://aomedia.org/license/patent-license/)

### 推荐 production 基线

调研日项目环境可解析到 `sharp@0.35.3`，其 git commit 为
`1018449164723ba0203c1beffaba0e21f7829c18`，npm integrity 为
`sha512-ej0zVHuZGHCiABXcNxeYhpRnPNPAcvbG8RMdBAhDAxLKkCRVSpK3Iyu7qbqw3JMzoj0REeM6f3tJLtVwl0023Q==`，
并在 npm registry 带 provenance attestation。本机 darwin-arm64 对应
`@img/sharp-darwin-arm64@0.35.3` 与 `@img/sharp-libvips-darwin-arm64@1.3.2`：前者的
integrity 是
`sha512-RMnFX7YQsMoh7lWfcM4NEHHymBX/rLuKNPVM84XE9ONPcaSCDgE7CHIHpSgPcO2xcRthgBy1HfNO319mwhIAkg==`，
后者是
`sha512-9J6ypZFpQBj4YnePGoq/S38w6nz+vqg5WZLrLGY4YuSemdMq47GMLBPO42MzwdGwpg/agZ7xzZcFHa48xlywfg==`；
其 `versions.json` 记录 libvips 8.18.3、libheif 1.23.1、libaom 3.14.1。

平台 package 的许可证不能被简化成“Sharp 是 Apache-2.0”：

- macOS/Linux 等拆分 artifact 中，`@img/sharp-<platform>@0.35.3` native addon 通常声明
  Apache-2.0，而 `@img/sharp-libvips-<platform>@1.3.2` 声明 LGPL-3.0-or-later；
- Windows `@img/sharp-win32-*` 是 combined artifact，当前 manifest 声明
  Apache-2.0 AND LGPL-3.0-or-later；
- libvips platform package 的完整 licensing table 还列出 libheif/libvips 等 LGPL、libaom
  BSD-2-Clause + AOM Patent License、cairo MPL-2.0，以及 MIT/BSD/zlib 等支持库；
- FreeBSD/Wasm 和后续新 target 必须读自己的 manifest，不能套用 darwin-arm64 结论。

调研证据包括
[`@img/sharp-libvips-darwin-arm64` npm package](https://www.npmjs.com/package/%40img/sharp-libvips-darwin-arm64)、
[`@img/sharp-darwin-arm64` npm package](https://www.npmjs.com/package/%40img/sharp-darwin-arm64)
与项目 frozen lockfile。最终发布以安装到目标 tarball 的 exact manifest 为准。

这些数字只能证明当前平台 artifact，不能代表所有 optional package。发布矩阵中的每个
OS/arch/libc package 都必须分别记录：npm integrity、native file SHA-256、`versions.json`、
`sharp.versions`、`sharp.format`、source commit、build flags 与 SBOM。不能只锁顶层
`sharp@0.35.3` 后假设 native 栈已经固定。

Sharp 当前官方安装文档列出的 native targets 包括 macOS x64/arm64、Linux arm、
arm64、riscv64、ppc64、s390x、x64 的 glibc/musl 组合，以及 Windows x64/x86/arm64；
FreeBSD 与部分环境走 WebAssembly。package manager 必须安装 optional dependencies，
跨平台 lockfile 还要显式配置目标架构。release 环境设置
`SHARP_IGNORE_GLOBAL_LIBVIPS=1`，禁止宿主全局 libvips 覆盖固定 artifact。

主要一手来源：

- [`sharp@0.35.3` npm metadata](https://registry.npmjs.org/sharp/0.35.3)
- [Sharp installation 与平台矩阵](https://sharp.pixelplumbing.com/install/)
- [Sharp 0.35.0 breaking changes](https://sharp.pixelplumbing.com/changelog/v0.35.0/)
- [Sharp global cache/concurrency 文档](https://sharp.pixelplumbing.com/api-utility/)
- [Sharp AVIF 与 timeout 文档](https://sharp.pixelplumbing.com/api-output/)

Sharp 0.35 把有损 AVIF 默认 tuning 改成基于 SSIMULACRA2 的 `iq`；历史 0.33 路径没有这个
当前默认。Phase 6 不把 tune 扩张为公开 option，但在 normalized worker request 中固定
`tune:'ssim'`，避免同一个 compatibility quality 静默切换到新 metric。native 版本、色彩
转换、container writer 和 codec 仍与历史不同，所以只声明 semantic/visual compatibility。

当前 Sharp 0.35.3 prebuilt AVIF runtime 对 output 仍是明确的 8-bit-only 边界：虽然一般
HEIF/AVIF API 和底层 libheif 能表示 10/12-bit，platform artifact 对
`.avif({bitdepth:10|12})` 不提供可发布支持。Phase 6 在 plugin factory 同步拒绝非 8，避免
请求进入 child 后才失败，也绝不把 10/12-bit 输入经 8-bit 输出称为高位深保真。高位深要等
可重复 native build、HDR/color-management contract、独立 16-bit decoder corpus 和各平台
artifact gate 完成后，用新能力单独发布。

## `imagemin-avif@0.1.6` 的真实契约

### 精确 runtime

上游全部运行时代码实质上是：

```js
"use strict";
const sharp = require("sharp");
const PluginError = require("plugin-error");

const defaultOptions = {
  quality: 90,
  lossless: false,
  speed: 5,
  chromaSubsampling: "4:2:0",
};

module.exports = (options) => async (buffer) => {
  return await sharp(buffer)
    .avif(Object.assign(defaultOptions, options))
    .toBuffer()
    .catch((err) => {
      callback(new PluginError("imagemin-avif", err));
    });
};
```

公开形状可以写成：

```ts
type ImageminAvif = (options?: AvifOptions) => (input: Buffer) => Promise<Buffer>;

interface AvifOptions {
  quality?: number;
  lossless?: boolean;
  speed?: number;
  chromaSubsampling?: "4:2:0" | "4:4:4";
}
```

但 runtime 有以下关键偏差：

- `Object.assign(defaultOptions, options)` 修改模块级对象。某次创建 plugin 的显式值会泄漏到
  后续实例和调用，结果依赖执行顺序；unknown property 也会永久保留。
- `undefined` property 会覆盖默认值为 `undefined`。factory 没有 schema validation。
- `speed` 被原样传给 Sharp，但 Sharp 选项名是 `effort`；unknown property 被忽略，所以
  README 中最重要的性能选项**完全不生效**。
- 因为所有属性都透传，README 未公开的 `effort` 和 `bitdepth` 反而可能生效并继续污染
  全局 defaults。
- 没有格式 detector 和 pass-through。Sharp 支持的所有输入都会 decode 后转成 AVIF；
  不支持或损坏的输入拒绝。
- 没有真正限定 `Buffer`。Sharp constructor 也接受 `ArrayBuffer`、typed array 和路径
  string；直接使用时，string 会触发文件系统读取。这不能成为项目公开契约。
- `.avif()` 的 options validation 是同步的。它发生在 `.toBuffer().catch()` 之前，因此会以
  async function 的原始 Sharp error 拒绝。
- decode/encode 的异步失败进入 `.catch()` 后会调用不存在的 `callback`，最终得到
  `ReferenceError: callback is not defined`，原始 codec error 被覆盖；`PluginError` 实际没有
  成功交付。

Phase 6 必须用独立 immutable defaults、严格 options schema、Buffer-only 输入与稳定 typed
error 修复这些问题，并在 migration notes 中明确它们是 intentional compatibility fixes。

### README 与 Sharp 0.33.5 的真实 options

| 项目                | README / wrapper                   | Sharp 0.33.5 实际规则                                 | Phase 6 决策                                              |
| ------------------- | ---------------------------------- | ----------------------------------------------------- | --------------------------------------------------------- |
| `quality`           | 默认 90，写作 0..100               | integer 1..100；0 同步报错                            | 公开 1..100，默认 90                                      |
| `lossless`          | 默认 false                         | boolean                                               | 保留；默认 chroma 仍为 4:2:0，并明确非 RGB pixel lossless |
| `speed`             | 默认 5；0 最慢、8 最快             | Sharp 不认识，历史输出固定使用默认 `effort=4`         | 0..8，比例映射到完整 effort 9..0                          |
| `chromaSubsampling` | 默认 4:2:0；README 类型误写 number | 只接受 `4:2:0` 或 `4:4:4`                             | string union；所有模式默认 4:2:0                          |
| `effort`            | 未公开                             | integer 0..9；0 最快、9 最慢                          | 显式公开 0..9；与 `speed` 互斥                            |
| `bitdepth`          | 未公开                             | API 接受 8/10/12，但 0.33.5 prebuilt 明确阻止非 8-bit | 公开 literal `8`；10/12 同步拒绝                          |

`speed` 的最终映射是 `round((8 - speed) * 9 / 8)`：README 的 `speed=0` 精确落到最慢
effort 9，`speed=8` 精确落到最快 effort 0，中间 7 个值按比例 round。未传 `speed` 和
`effort` 时不合成任何字段，继续使用 pinned Sharp 默认 effort 4；因此 upstream 默认输出的
effort 不因修复 speed 而改变。高级调用方可直接传 `effort`，但两者同时出现时同步拒绝。

历史 regression corpus 还应固定两条事实：

- `speed=0..8` 在 exact upstream oracle 中输出和耗时只受噪声影响，不能把这个 bug 当成
  production 行为；
- 修复后的 Phase 6 中，speed 至少要在编码耗时、输出大小或 bitstream 上产生可测差异，
  否则 mapping/sidecar argv 没有真正生效。

### 历史默认输出管线

Sharp 0.33.5 的 `.avif()` 是 `.heif({ ...options, compression: 'av1' })`。Sharp 自身默认是
quality 50、lossless false、effort 4、chroma 4:4:4、bitdepth 8；wrapper 覆盖 quality 为
90、chroma 为 4:2:0，`speed` 被忽略。因此真实默认最终是：

```text
quality=90, lossless=false, effort=4, chroma=4:2:0, bitdepth=8
```

libvips 8.15.3 把 effort 转成 libheif AOM encoder 的 `speed = 9 - effort`，所以默认 AOM
speed 为 5。libheif 1.18.2 AOM plugin 的 quality-to-CQ 映射近似为
`((100 - quality) * 63 + 50) / 100`，still encode 使用 all-intra、zero lag 与 still-picture
配置。

Sharp pipeline 在保存前 cast 到 `VIPS_FORMAT_UCHAR` 并移除 animation properties；历史
prebuilt 因而是 8-bit static AVIF。libvips 本身可向 libheif 请求 8/10/12 bit，但这不等于
Sharp 0.33.5 npm artifact 能交付高位深输出。

## 输入、metadata、动画与 alpha

### 输入格式与路径边界

历史 Sharp prebuilt 可从 Buffer 读取 JPEG、PNG、WebP、AVIF/HEIF、GIF、SVG、TIFF 等格式。
这不是 `imagemin-avif` 自己定义的 detector；所有实际支持范围取决于具体 native artifact
的 `sharp.format`。Phase 6 应在启动 child 前做 bounded preflight，仅允许明确列入契约的
Buffer 格式，禁止 string/path、URL、任意文件描述符与隐式网络访问。

推荐初始 static input matrix：

| 输入      | 决策           | 备注                                                         |
| --------- | -------------- | ------------------------------------------------------------ |
| JPEG      | 支持           | 覆盖 progressive、CMYK、ICC、EXIF orientation                |
| PNG       | 支持           | 覆盖 palette、gray、RGBA、16-bit、interlace；APNG 走动画策略 |
| WebP      | 支持静态       | animated WebP 在 child 前 identity no-op                     |
| AVIF/HEIF | 支持静态       | 接受高位深输入但输出 8-bit；sequence identity no-op          |
| GIF       | 仅静态单帧     | 多帧 GIF identity no-op，不取首帧                            |
| TIFF      | 仅单页         | 多页 TIFF identity no-op                                     |
| SVG       | identity no-op | Phase 6 不把 XML/native renderer 纳入攻击面                  |
| 其他      | identity no-op | 与 imagemin 对不适用输入的 no-op 风格一致                    |

Phase 6 选择与 WebP 路径一致的 identity safety policy：不支持格式、多帧和多页输入原样返回
同一个 Buffer，而不是交给 Sharp 静默 staticize，也不抛 typed error。file API 根据最终 magic
决定目标扩展名，因此 identity no-op 不会把原文件错误重命名成 `.avif`；只有成功转码才原子地
改为 `.avif`。上游 README 的 Gulp 示例会把后缀追加成 `.jpg.avif`，这不是 Buffer API 契约。

### 动画

Sharp constructor 默认 `pages=1`/非 animated，native output pipeline 又移除 animation
properties；官方文档也没有把 AVIF image sequence 作为受支持输出。因此 animated GIF、
APNG、animated WebP、多页 TIFF 或 AVIF sequence 可能被静默变成第一/主帧。

Phase 6 必须在 decode/encode 前独立解析 container feature，并在任何 target 包含多个
frame/page 时返回输入的同一 Buffer 引用。测试不能只检查 Sharp metadata 的一个布尔值；
要用独立 parser 验证 frame count、loop、sequence item 与 grid/derived item，并断言 child
完全未启动。

动画 AVIF 应留给未来单独 API，届时需要定义 duration、timescale、repetition、blend、
disposal、alpha、metadata 和 progressive/layered 语义，不能通过放宽 `avif()` 暗中加入。

### metadata 与 orientation

历史 plugin 没有调用 `keepMetadata()`/`withMetadata()`。Sharp 默认移除 EXIF、XMP、ICC，
并把颜色转换到 device-independent sRGB。Phase 6 compatibility profile 应维持 metadata
strip，不暴露 raw-copy option，输出独立检查：

- 不含 EXIF、XMP、ICC、gain map 与 thumbnail item；
- 不保留可能泄露位置/设备的 metadata；
- 历史 Sharp 0.33 路径不自动旋转，删除 EXIF orientation 后可能改变显示方向；Phase 6
  把 auto-orient-before-strip 作为 intentional display correctness fix，并在 migration
  tests 中覆盖全部八种 EXIF orientation。

即使输出默认 strip，输入 decoder 仍会解析部分 metadata/container，因此 metadata chunk
和 box 数量仍要计入输入资源限制与 adversarial corpus。

### alpha、chroma 与 lossless

libheif 1.18.2 AOM plugin 在未另设 alpha quality 时让 alpha 使用 color quality；历史默认
quality 90 的 alpha 因而仍是 lossy。`lossless:true` 会对 color 和 alpha 使用 lossless
quantizer，但 Sharp 总是显式传 `subsample_mode`。wrapper 的模块级默认又是 4:2:0，所以
`lossless:true` 仍可能先丢失 RGB chroma 信息。

Phase 6 为保持上游默认值，不因 `lossless:true` 自动改 chroma，也不拒绝显式 4:2:0：

- `lossless:false`：默认 4:2:0；允许显式 4:4:4；alpha 按 quality 编码；
- `lossless:true`：仍默认 4:2:0；这里只承诺 AV1 encoder lossless mode，不承诺经过 chroma
  conversion 后的 RGB pixel equality；
- 只有显式 lossless+4:4:4 才进入 visible RGBA exact gate；全透明像素下 hidden RGB 另设
  明确 policy；
- 文档和 diagnostic 始终记录 effective chroma，避免用户把裸 `lossless` 误解成 RGB exact。

有损 alpha 图的视觉测试必须分别合成到黑、白和 checkerboard 背景，另外单独测 alpha
MAE；只在透明背景上算 RGB metric 会漏掉边缘 halo 和 hidden colour 问题。

## 候选实现比较

### 总体决策矩阵

| 方案                      | compatibility                 | 输入/metadata                                          | 位深/chroma/alpha                                 | 故障与资源隔离                              | 平台/发布风险                                 | 决策                       |
| ------------------------- | ----------------------------- | ------------------------------------------------------ | ------------------------------------------------- | ------------------------------------------- | --------------------------------------------- | -------------------------- |
| exact Sharp 0.33.5 child  | 同一 artifact 可作历史 oracle | 最接近历史；metadata strip；动画静默首帧               | 实际 8-bit；420/444；alpha                        | process boundary，但旧 native CVE           | 旧 Node/native artifact，平台矩阵有限         | 仅离线 oracle              |
| 当前 Sharp 0.35.3 child   | API/semantic/visual           | 多格式解码成熟；可显式 strip/preflight                 | 当前 prebuilt output 只允许 8-bit；420/444；alpha | 可 hard kill；仍需 OS RSS/CPU 限制          | optional platform artifacts 必须完整锁定      | **Phase 6 production**     |
| 当前 Sharp 直接进 host    | 同上                          | 同上                                                   | 同上                                              | native crash/OOM 终止宿主；全局状态相互影响 | 部署简单但 blast radius 最大                  | 否决                       |
| libavif 1.4.1/AOM sidecar | 不兼容 Sharp bytes/quality    | `avifenc` 只读 JPEG/PNG/Y4M；需自建其他 decoder        | 8/10/12；400/420/422/444；独立 alpha quality      | process boundary；jobs 可控                 | C/C++ build、decoder 与 metadata 工作量大     | future native engine       |
| `libavif-sys@0.17.0`      | 否；绑定旧 libavif 1.0.4      | raw sys 能力大，高层 wrapper 太薄                      | raw API 可覆盖，调用方负担大                      | addon 内，unsafe/native crash               | stale libavif；CMake/dav1d/rav1e/aom 组合复杂 | Phase 6 否决               |
| `ravif@0.13.0`            | 否                            | 只接 raw pixels；仅有限 EXIF；无 Sharp decode pipeline | 8/10；固定 4:4:4；alpha；无 12-bit                | addon 内；Rayon/rav1e cancellation 困难     | Rust/asm/CPU target 与全局线程池需验证        | experimental static engine |

### 为什么 production 选择当前 Sharp sidecar

当前 Sharp 是唯一能在合理工作量内同时提供多格式输入、稳定色彩/alpha pipeline、活跃维护
和主流 npm 平台 artifact 的方案。process boundary 还允许：

- child crash 只失败当前 job，父进程把 signal/exit code 归一化成 typed error；
- timeout/cancel 时终止完整 process tree，而不是等待 native callback 返回；
- 对单 job 施加 RSS、CPU、file descriptor、temp disk 与 stdout/stderr 上限；
- 每个 worker 启动时验证 `sharp.versions` 和 `sharp.format` 与 manifest；
- 当前 one-shot child 每个 job 后自然回收；若未来改成 pool，则按 job 数或 RSS watermark 回收；
- 把 LGPL/native notices 和 SBOM 与可执行 artifact 一一绑定。

sidecar 不应 import `imagemin-avif`。它只实现经过验证的 immutable adapter；否则全局 options
污染、错误覆盖和未限定的 path input 会重新进入 production。

Sharp 自带 `.timeout({seconds})`，但官方说明计时从 libvips 打开输入开始，不包含等待 libuv
worker 的时间。它也不等于 OS CPU/RSS/output/process-tree 限额。因此可作为 child 内软超时，
父进程仍必须有更长一点的 hard deadline 并在超时后 kill worker。

### 为什么不在 Node/napi-rs 宿主内直接调用 Sharp

Sharp 官方把 cache 和 concurrency 定义为全局属性。`sharp.concurrency(n)` 只约束 libvips
每张图的 GLib thread pool；官方明确提示 libaom 等格式库会创建自己的线程，且独立于该值。
历史 libheif AOM plugin 更会以 hardware concurrency 为默认并设置上限 64。

因此 direct host 存在四类无法靠普通 Promise cancellation 解决的问题：

1. libvips/libheif/libaom 的 segfault、abort 或 heap corruption 会结束整个进程；
2. 恶意输入或极慢 effort 占用 native worker 后，AbortSignal 不保证立即停止 codec；
3. Sharp global cache/concurrency 会让并发 job、其他插件和用户代码互相影响；
4. libaom 内部线程与外层 Rust/Node job 并发叠加，容易 oversubscription 和 RSS 峰值放大。

如果未来直接嵌入 native codec，至少需要证明 crash-safe input boundary、cooperative cancel、
per-job allocator accounting 和 thread budget；当前候选均不满足。

### libavif 1.4.1/AOM sidecar

当前官方 [`libavif v1.4.1`](https://github.com/AOMediaCodec/libavif/releases/tag/v1.4.1)
是可移植 C AVIF 实现，支持 AV1 YUV formats、8/10/12-bit 与 alpha。其
[`avifenc` 1.4.1 manual](https://github.com/AOMediaCodec/libavif/blob/v1.4.1/doc/avifenc.1.md)
定义：

- `--qcolor` 0..100，100 lossless；`--qalpha` 独立控制 alpha；
- `--speed` 0..10，0 最慢、10 最快，默认 6；
- `--jobs` 默认使用所有可用线程，必须显式设上限；
- `--depth` 支持 8/10/12；`--yuv` 支持 auto/444/422/420/400；
- 可以选择 full/limited range、premultiply、SharpYUV；
- 支持多输入 sequence、duration、timescale、repetition 和 progressive/layered；
- 默认复制输入 EXIF/XMP/ICC，compatibility 必须显式 `--ignore-exif`、`--ignore-xmp`、
  `--ignore-profile`、`--ignore-gain-map`。

但 `avifenc` 输入只覆盖 JPEG、PNG、Y4M，stdin 还需显式 input format。它不能单独替代 Sharp
的 WebP、AVIF、GIF、SVG、TIFF 解码，色彩转换、quality mapping、metadata/container 输出也
不相同。libavif v1.4.1 的 LocalAom helper 更新到 libaom 3.13.2；生产 build 更应固定单独
安全扫描过的 AOM artifact，而不是盲从 helper 默认。

它适合 future native/current engine：对高级用户公开独立 `qualityAlpha`、12-bit、422、jobs
和 sequence API；不适合作为首个 `avif()` compatibility backend。

### `libavif-sys` / `libavif` Rust wrapper

调研日当前 [`libavif-sys@0.17.0+libavif.1.0.4`](https://docs.rs/crate/libavif-sys/0.17.0/source/)
仍 vendored libavif 1.0.4，默认 features 是 dav1d + rav1e，AOM 需要显式启用；当前
`libaom-sys@0.17.2+libaom.3.11.0` 也不是 Sharp 历史或当前的同一 codec 组合。build 使用
CMake，dav1d 还带 Meson/Ninja/NASM 等工具链要求，并关闭 libyuv/SharpYUV，颜色转换不会
复现 Sharp/libvips。

同仓库高层 [`libavif@0.14.0`](https://docs.rs/crate/libavif/0.14.0/source/) README 自己也说明
API 对 production 通常过于 minimal。它能方便编码 8-bit RGB/RGBA/luma、提供 sequence
encoder，但默认 max threads 为 1，metadata 和完整 10/12-bit/chroma 控制不足。raw sys
理论上能覆盖更多能力，却把大面积 unsafe API、lifetime、stride、plane/alpha/container
validation 责任交给本项目。

若未来必须 direct native libavif，应围绕当前 libavif 1.4.1 重新生成并审计 bindings，固定
codec/build matrix；不要为了“Rust crate 已存在”而接受 1.0.4。

### `ravif@0.13.0`

[`ravif@0.13.0`](https://docs.rs/crate/ravif/0.13.0/source/) 是 BSD-3-Clause、Rust 1.85、
edition 2024，依赖 `rav1e@0.8.1`、`avif-serialize@0.8.6`，默认开启 asm 与 threading。
它接收 raw RGB8/RGBA8 或 planes，而不是压缩格式 Buffer；所有输入解码、色彩、metadata、
animation routing 都要另建。

与 compatibility 相关的限制：

- 输出只支持 8/10-bit，没有 12-bit；
- chroma 固定 4:4:4，没有 4:2:0/4:2:2；
- 默认 quality 80、speed 5、自动选择 10-bit，与历史默认完全不同；
- speed 合法范围是 1..10，quality 是 1..100，setter 对非法值会 panic；跨 FFI 前必须验证，
  也应提供 `catch_unwind` 最后防线；
- 有独立 alpha quality 和 associated/unassociated alpha modes；
- public metadata 主要是 EXIF，没有完整 ICC/XMP API；
- 默认 YCbCr、full range，primaries/matrix 固定策略不等价于 Sharp；
- 没有独立 lossless flag。quality 100 虽可让 AV1 quantizer 为 0，但 RGB->YCbCr rounding
  仍不能未经 conformance 就称 RGB pixel lossless。

threading 由 Rayon/global pool 与 rav1e 共同参与，`with_num_threads(Some(n))` 能缩小部分
预算，但 color/alpha encode 仍可能并行；没有适合 Node AbortSignal 的完整 cooperative
cancellation。它适合 future pure-Rust static profile，最好仍放在 worker/process boundary
处理不可信大图。

## 推荐 API 与内部协议

### public compatibility API

```ts
interface AvifOptions {
  /** Integer 1..100. Default: 90. */
  quality?: number;

  /** Default: false. This does not imply RGB pixel lossless with 4:2:0. */
  lossless?: boolean;

  /** Sharp effort, integer 0 (fastest) to 9 (slowest). Mutually exclusive with speed. */
  effort?: number;

  /** Legacy integer 0 (slowest) to 8 (fastest). Mutually exclusive with effort. */
  speed?: number;

  /** Default: 4:2:0 for both lossy and lossless modes. */
  chromaSubsampling?: "4:2:0" | "4:4:4";

  /** Current Sharp platform artifacts support 8-bit AVIF output only. */
  bitdepth?: 8;
}

function avif(options?: AvifOptions): ImageminPlugin;
```

`effort` 和 literal `bitdepth:8` 是 Phase 6 有意增加的、可验证的 Sharp 能力；`speed` 保留
社区包命名并按 `round((8-speed)*9/8)` 归一化。不要暴露 `engine`、`tune` 或其他原生库内部
参数。engine selection 是项目构建/feature 或单独 experimental API；否则同一 options 在
不同引擎上的 quality、speed、alpha 与 metadata 含义不可稳定。

validation 要在 child 启动前完成，拒绝 NaN、Infinity、fraction、unknown key、错误类型和
越界值。options normalization 返回新 immutable value，不修改调用方对象，也不在实例间
共享可变 defaults。

### sidecar 内部 normalized request

```ts
interface NormalizedAvifOptions {
  bitdepth: 8;
  quality: number;
  lossless: boolean;
  effort?: number;
  chromaSubsampling: "4:2:0" | "4:4:4";
  tune: "ssim";
}
```

当前 one-shot child 通过受验证的 JSON argv 接收 normalized options，通过 stdin/stdout 传
raw input/output bytes；父进程分别限制 input、output、stderr 与 wall time。禁止 JSON/base64
图片、临时路径参数和任意 child file read。stderr 只用于 bounded diagnostic，不得混入
binary stdout。若未来为降低启动成本引入常驻 worker，再升级为带 protocol version 和准确
length 的 framed protocol，不能依赖 EOF 作为多 job 边界。

每个成功响应内部附带但不进入用户图片 bytes 的 diagnostic：

```text
engine=sharp-sidecar
compatibility=semantic-visual
sharpVersion
vipsVersion
heifVersion
aomVersion
platformPackage
platformPackageIntegrity
nativeBinarySha256
normalizedOptions
```

这些字段也进入 content-cache key；只用 input hash + public options 会在 native artifact
升级后错误复用旧输出。

## 资源、线程与取消策略

AVIF encode 的 CPU 和内存成本远高于普通格式转换，尤其是低 speed/high effort。初始保守
limit 建议如下，最终数值要用目标 CI/production 机器 benchmark 校准：

| 资源                     | 初始 hard/soft limit    | 理由                                                       |
| ------------------------ | ----------------------- | ---------------------------------------------------------- |
| compressed input         | 256 MiB                 | 阻止无限 stdin/buffer；大于常见 imagemin workload          |
| 单边尺寸                 | 16,384 px               | 对齐历史 libvips HEIF save 上限                            |
| decoded pixels           | 67,108,864（64 MP）     | 远低于 Sharp 默认约 268 MP，限制 decode bomb               |
| JS old-space             | 768 MiB                 | 当前 child 启动参数；不等于 native RSS 上限                |
| working RSS              | 1 GiB/job               | **剩余 OS gate**；RGBA、YUV、alpha 与 native codec buffers |
| output                   | 512 MiB                 | `toBuffer()` 全量驻留；防止 stdout 无限增长                |
| metadata 单 chunk / 总量 | 8 MiB / 16 MiB          | 默认虽 strip，input parser 仍可能接触                      |
| stderr                   | 1 MiB                   | 防止错误日志反向耗尽父进程内存                             |
| wall timeout             | 180 s soft / 190 s hard | child soft timeout 后由父进程销毁 one-shot child           |
| file descriptors         | 32/job                  | **剩余 OS gate**；Buffer-only sidecar 不需要宽泛文件访问   |
| temp disk                | 0                       | 当前 stdin/stdout one-shot protocol 不落盘                 |

child 初始化：

```text
SHARP_IGNORE_GLOBAL_LIBVIPS=1      # release environment gate
sharp.cache(false)
sharp.concurrency(1)
limitInputPixels=67_108_864
sequentialRead=true
failOn='warning'
timeoutSeconds=180
```

当前已经落地 input 256 MiB、单边 16,384、pixels 64 MP、metadata 8/16 MiB、output
512 MiB、stderr 1 MiB、JS old-space 768 MiB、180 s soft timeout 和 190 s hard timeout；
`sharp.cache(false)`、`sharp.concurrency(1)`、`sequentialRead` 与 `failOn:'warning'` 在 child
内生效。尚不能因此声称完整 sandbox：native RSS/CPU/file-descriptor、process-tree、
`SHARP_IGNORE_GLOBAL_LIBVIPS` frozen install 与公开 AbortSignal 仍是 release-engineering gate。

`sharp.concurrency(1)` 只限制 libvips，不保证 libaom 单线程。外层并发初始应设为 1，完成
CPU/thread/RSS benchmark 后最多按 memory semaphore 和
`min(floor(availableParallelism / 4), 2)` 放宽。必须采集实际 peak thread count，不能把
配置值当测量值。

取消的最终 gate 分两层：先停止接收 job/关闭 pipe，给很短 grace period；随后由父进程终止
完整 child process tree。timeout、RSS、CPU、output overflow、protocol violation 都销毁
one-shot worker。不能把“当前 wall timeout 能结束直接 child”表述成 AbortSignal 和所有后代
进程都已完成验证。

Linux 使用 cgroup v2/rlimit/seccomp 等可用机制；macOS/Windows 使用各自 job/process sandbox
能力。不同平台无法提供完全相同 primitive 时，contract 应描述等价的结果边界，而不是假装
实现相同。

## 安全、供应链与许可证

### 历史 stack 的已知风险

截至 2026-07-17，exact oracle 的 libheif 1.18.2 明确受以下问题影响：

- [CVE-2026-32740](https://nvd.nist.gov/vuln/detail/CVE-2026-32740)：libheif <=1.21.2
  在默认 grid decode 中可发生攻击者控制的 heap-buffer-overflow write，1.22.0 修复；
- [CVE-2026-32882](https://nvd.nist.gov/vuln/detail/CVE-2026-32882)：libheif <=1.21.2
  overlay 的 alpha/color stride 混用造成 heap over-read，1.22.0 修复；
- [CVE-2026-32738](https://nvd.nist.gov/vuln/detail/CVE-2026-32738)：libheif <=1.21.2
  crafted sequence 可触发 denial of service，1.22.0 修复。

这使“完全复制旧 npm artifact 到生产”直接出局。给旧版本 backport patch 虽能减小风险，
但 artifact 已不再 exact，且仍要维护整条过时 native stack；相比升级到当前 Sharp，收益不足。

libvips 8.15.3 也会被通用 scanner 命中
[CVE-2026-3145](https://nvd.nist.gov/vuln/detail/CVE-2026-3145) 等记录；部分向量可能只涉及
local/custom loader，不一定从本项目 Buffer path 可达。reachability 必须以 source 和实际
build features 证明，不能仅凭“sidecar 隔离”或“我们认为不可达”关闭告警。

当前 Sharp sample stack 的 libheif 1.23.1 已越过上述 1.22.0 fixed boundary，但这不代表
“无 CVE”。每个 release candidate、每个平台 SBOM 都要在发布当日重新跑 OSV/NVD/组织扫描，
对 high/critical 记录给出 fixed version 或可审核 reachability；文档中的一次性快照不能替代
release gate。

### provenance 与 artifact gate

每个平台 npm 发布物必须：

1. 固定顶层与所有 optional native package 的 exact version/integrity；
2. 禁止 install-time network fallback、system libvips 和未记录的 runtime download；
3. 归档 npm provenance、source commit、builder/toolchain、flags、native binary hashes；
4. 启动 smoke test 比较 runtime `sharp.versions`、`sharp.format` 与 signed manifest；
5. 生成含 libvips/libheif/libaom 及传递依赖的 SPDX/CycloneDX SBOM；
6. 归档每个平台 `versions.json`，不要用 darwin-arm64 的版本替代其他 target；
7. 在 clean tarball/container 中验证无需开发机全局依赖即可 encode/decode；
8. 对平台矩阵执行 malformed corpus 与 resource-limit tests。

### 当前实现之后仍阻断正式发布的门槛

Phase 6 API、one-shot Sharp child、格式 preflight 和 JS 层 byte/time limits 已可测试，但以下
事项完成前，不应把“实现完成”写成“多平台 production artifact 已完成”：

1. 每个声明支持的 OS/arch/libc 从最终 npm tarball 做 frozen install，验证 exact
   `@img/sharp-*`/`@img/sharp-libvips-*` version、integrity、native hash、`versions.json`、
   `sharp.versions` 和 AVIF smoke；
2. 按平台保存完整 licensing manifest、LGPL source/offer 与 replacement/debugging 合规材料，
   以及 AOM Patent License；不能仅依赖顶层 Sharp Apache-2.0；
3. 增加 OS 级 native RSS、CPU、file-descriptor、process-tree 限制，完成 AbortSignal hard
   cancellation 和并发 memory semaphore；当前 JS old-space/wall timeout 不覆盖这些边界；
4. 对 final SBOM 做发布当日 CVE/reachability 审计，任何 reachable high/critical 必须修复或
   取得正式 exception；
5. 在所有 target 跑 legal/malformed corpus、animation identity、8-bit-only、lossless/chroma、
   alpha/metadata/orientation、determinism 和 resource regression；
6. 证明 install 不使用 global libvips、运行时下载或 install-time compilation fallback，并让
   content cache key 包含完整 codec/platform fingerprint。

### 许可证与专利

| 组件                   | 许可证 / patent                                                                                     | 发布动作                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `imagemin-avif`        | MIT                                                                                                 | oracle notices；production 不执行其 runtime                              |
| `plugin-error`         | MIT                                                                                                 | 仅 oracle 依赖                                                           |
| Sharp                  | Apache-2.0，含贡献 patent grant                                                                     | 分发 LICENSE/NOTICE，记录 source                                         |
| `@img/sharp-*`         | macOS/Linux addon 通常 Apache-2.0；Windows combined package 当前为 Apache-2.0 AND LGPL-3.0-or-later | 逐 target 保存 exact manifest；不能用顶层 Sharp license 覆盖             |
| `@img/sharp-libvips-*` | 本次核验 manifest 为 LGPL-3.0-or-later                                                              | 完整许可证、对应源码/offer、可替换/调试要求由法务确认                    |
| libvips                | upstream source 为 LGPL-2.0-or-later；当前 npm platform manifest 选用 LGPLv3                        | 以实际 artifact 声明和完整 notices 为准                                  |
| libheif 1.18.2         | library LGPL-3.0；示例 app MIT                                                                      | 分发 LGPL text、对应 source/offer                                        |
| libaom                 | BSD-2-Clause + AOM Patent License 1.0                                                               | 分发 copyright、BSD 与 patent license text；审查 reciprocity/termination |
| libavif                | BSD-2-Clause                                                                                        | future engine 同时归档 bundled third-party notices                       |
| ravif                  | BSD-3-Clause；rav1e BSD-2-Clause                                                                    | 归档 crate graph licenses；AV1 patent 仍需组织级审查                     |

AOM patent license 提供 worldwide、royalty-free Necessary Claims grant，同时包含在分发
implementation 时提供 patent license、Necessary Claims availability/reciprocity 与 patent
litigation termination 条款。不能只分发 libaom 的 BSD `LICENSE` 而遗漏 patent text。

## 测试与确定性门槛

### corpus

建议至少 600 个合法样本和 300 个 adversarial 样本：

| 类别        | 最少数量 | 覆盖重点                                                                        |
| ----------- | -------- | ------------------------------------------------------------------------------- |
| JPEG        | 150      | baseline/progressive、CMYK、gray、ICC、EXIF orientation、truncated              |
| PNG         | 150      | palette、gray、RGBA、16-bit、interlace、APNG、large chunks                      |
| WebP        | 100      | lossy/lossless、alpha、animated、odd dimensions                                 |
| AVIF/HEIF   | 100      | 8/10/12-bit、420/422/444、alpha、grid、sequence、gain map、metadata             |
| GIF         | 50       | static、animated、disposal/loop                                                 |
| TIFF        | 30       | endian、compression、tile/strip、multi-page                                     |
| SVG         | 20       | huge dimensions、nested filters、external refs、malformed XML                   |
| adversarial | 300      | odd grid tiles、box nesting、cycles/item refs、bombs、huge metadata、truncation |

所有样本必须记录来源、再分发许可、SHA-256 与预期 feature；不能从网络临时下载后直接进入
release tests。

### options matrix

至少覆盖：

- quality：1、50、90、100，以及 0、101、fraction、NaN、错误类型；
- speed：0..8 全量，以及 -1、9、fraction；
- lossless：false/true，分别组合 omitted/420/444；
- alpha：opaque、半透明边缘、全透明、hidden RGB；
- metadata/orientation：无/EXIF/XMP/ICC/gain map、所有 orientation；
- 所有输入格式与 malformed variants；
- animated/multi-page/sequence 与未知格式一律断言同一 Buffer 引用 identity no-op，且不启动
  child；
- cancel、soft timeout、hard timeout、RSS/output overflow、child crash、protocol truncation。

exact upstream oracle 还要顺序化构造多个 factory，证明 global options 污染；分别触发同步
option error 和异步 codec error，固定其不同 rejection。production 则断言实例完全隔离、
原始 codec cause 被保留且不暴露路径/secret。

### byte 与 semantic/visual profile

只在“同 OS/arch/libc、同 npm/native artifact hashes、同 worker 配置、同 input/options”条件
下尝试 byte comparison。即使条件相同，也必须连续运行至少 10 次证明 libaom 多线程输出
稳定后，才能把 byte equality 设成 exact oracle gate。跨平台和 current Sharp 不设 byte gate。

production semantic gates：

- 独立 parser 验证 AVIF brand、单帧、dimensions、alpha、chroma、bit depth；
- 独立 metadata parser 验证默认无 EXIF/XMP/ICC/gain map；
- 所有输出用独立 AVIF decoder 解码，不以 Sharp 同时 encode/decode 自证正确；
- lossy RGB 转到 linear light 后测 SSIMULACRA2、Delta E 2000，并对 alpha 单测 MAE；
- 透明图合成黑、白、checkerboard 三种背景后分别比较；
- quality 单调性按 corpus percentile 约束，不要求每张图的 size/metric 都严格单调；
- lossless+444 对约定的 visible RGBA 做 exact comparison；lossless+420 只验证已明确记录的
  encoder mode/chroma 和视觉阈值，不设 RGB exact gate；
- future 10/12-bit profile 用独立 16-bit pipeline 比较，禁止先降为 8-bit 掩盖误差。

current Sharp 相对历史 oracle 的初始候选阈值，可先设为：SSIMULACRA2 不低于 oracle 2 分，
Delta E 2000 mean 不高于 oracle 0.25、p95 不高于 0.75，alpha MAE 不高于 oracle
`1/255`。这些不是格式标准，应在首轮 corpus 数据分布出来后冻结并记录调整理由。

### 性能与资源 gate

每个平台至少报告：wall time、CPU time、peak RSS、peak thread count、output bytes、worker
startup/amortized latency、timeout/cancel latency。对 quality 50/90/100、speed 0/5/8、
opaque/alpha、1/8/64 MP 建基线。

release gate 应拒绝：

- 任一合法样本越过声明 hard limit 后父进程仍无法收回 worker；
- cancel 后 process tree 残留或 temp/output 泄漏；
- 两个并发 job 使 thread/RSS 超过预算；
- current platform artifact 与 manifest 版本/hash 不一致；
- high/critical reachable CVE 无修复或正式 exception；
- output metric、8-bit、lossless/chroma、metadata、animation identity policy 任一回归。

## 分阶段落地建议

### Phase 6A：固定 oracle 与契约

- 归档 `imagemin-avif@0.1.6`、Sharp 0.33.5 与每个平台 native artifact hashes；
- oracle 只在隔离、无网络、非生产 CI 中运行，明确标记已知 CVE；
- 写 global options 污染、ignored speed、sync/async error、metadata、animation 基线；
- 冻结 public `AvifOptions`、typed errors 与 compatibility exceptions。

### Phase 6B：production Sharp sidecar

- 固定 Sharp 0.35.3 和目标平台 optional artifacts；
- 实现 Buffer-only one-shot protocol、immutable normalization、公开 `effort`/`bitdepth:8` 和
  `speed -> effort` 比例映射；
- 固定 Sharp 0.35.3 当前 tune 行为、metadata strip、auto-orient correctness fix 与
  animation identity preflight；
- 加 OS resource sandbox、hard timeout/cancel、one-shot cleanup 与 diagnostics；
- 完成 static legal corpus、malformed corpus、visual/resource/platform tests。

### Phase 6C：发布硬化

- 每个平台生成 SBOM、provenance manifest、notices/source offer 和 AOM patent bundle；
- 运行 CVE/reachability、clean tarball、cross-platform install 与 native hash smoke tests；
- 用真实项目 workload 校准并发、RSS、timeout 和视觉阈值；
- 仅在所有 gate 通过后把 `avif()` 标记 stable。

### 后续 experimental engines

- `libavif 1.4.1 + pinned AOM` sidecar：面向 10/12-bit、422、独立 alpha quality、jobs 和
  sequence 的新 API；
- `ravif 0.13.0`：面向纯 Rust static encode，明确 8/10-bit、444、raw input 限制；
- 两者分别建立独立 semantic/visual/performance profile，不复用 Sharp byte cache key，也不
  改写 `avif()` 的 compatibility 声明。

## 最终决策

1. **生产：当前 pinned Sharp child-process sidecar。** 它是现阶段多格式语义、维护活跃度、
   npm 平台覆盖和隔离能力之间最稳妥的平衡。
2. **历史：exact Sharp 0.33.5 stack 仅作 offline oracle。** wrapper 有明确 bug，native stack
   还有已知 heap write CVE，不能处理生产输入。
3. **宿主内 direct Sharp：否决。** native crash、全局状态、线程与 hard cancellation 风险
   不符合 napi-rs 主进程边界。
4. **libavif/AOM sidecar：保留为 future native engine。** 能力最完整，但首阶段缺少 Sharp
   input/colour/quality 兼容链路。
5. **stale libavif-sys：否决。** 不以旧 libavif 1.0.4 换取表面的 Rust 集成便利。
6. **ravif：仅 experimental。** 纯 Rust 有价值，但 12-bit、420/422、metadata、decoder 与
   lossless 语义缺口太大。

这个决策刻意把“复现一个社区 wrapper”与“安全地发布 AVIF codec”拆开：前者由只读 oracle
回答，后者由当前、可追溯、可杀死、有限额的 sidecar 承担。
