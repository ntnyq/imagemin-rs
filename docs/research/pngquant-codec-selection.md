# Phase 3：PNG 有损量化 codec 选型与兼容契约

> 调研日期：2026-07-17。结论只针对本文固定的版本与提交；升级必须重新跑本文的
> corpus、许可和平台门禁。

## 决策摘要

1. `pngquant()` 的 JavaScript 兼容目标固定为
   [`imagemin-pngquant@10.0.0`](https://registry.npmjs.org/imagemin-pngquant/10.0.0)，
   对照提交固定为
   [`e8b6710e49ba2979a15d99a4f3be34679dfecc6f`](https://github.com/imagemin/imagemin-pngquant/tree/e8b6710e49ba2979a15d99a4f3be34679dfecc6f)。
2. Phase 3 只采用**独立进程 sidecar**，不得把 GPL-3.0-or-later 的
   `imagequant`、`imagequant-sys` 或 libimagequant 静态/动态链接进 MIT N-API addon。
   兼容基线锁定 pngquant `3.0.3` 提交
   [`53a332a58f44357b6b41842a54d74aa1e245913d`](https://github.com/kornelski/pngquant/tree/53a332a58f44357b6b41842a54d74aa1e245913d)，
   以及它的 libimagequant submodule
   [`6e9805761851f1a8320380b9f563961f892ec6ba`](https://github.com/ImageOptim/libimagequant/tree/6e9805761851f1a8320380b9f563961f892ec6ba)
   （crate 版本 `imagequant 4.2.2`）。
3. `pngquant-bin@9.0.0` 可作为 npm 兼容 oracle，但不能单凭包版本宣称跨平台一致：
   它发布的预构建件横跨 pngquant 2.5.2 至 3.0.3，source fallback 又是 2.16.0。
   正式发布必须自建/托管统一的 3.0.3 sidecar，并同时固定 executable SHA-256、
   `--version`、target triple 和对应源码。
4. [`imagequant@4.4.1`](https://crates.io/crates/imagequant/4.4.1) 是技术上最合适的
   Rust-native 候选，但仍是 GPL-3.0-or-later；只有取得商业许可，或拆成明确的 GPL
   独立发行物后，才可进入产品依赖。它也不是 3.0.3 oracle 使用的 4.2.2，升级不能
   期待 byte parity。
5. [`quantette@0.6.0`](https://crates.io/crates/quantette/0.6.0) 为
   MIT OR Apache-2.0，但官方明确不支持 alpha，MSRV 1.90 也高于当前项目的 1.88。
   Phase 3 不公开 `quantette()`，更不能把它隐藏在 `pngquant()` 名下。未来若实验，
   只能是独立的 opaque-only API；发现任意 `alpha < 255` 必须 pass-through 或返回
   `Unsupported`，绝不能 flatten。
6. quality floor 失败的唯一兼容信号是 pngquant exit code `99`，此时返回**原输入对象**；
   其他启动、解析、超时、signal 和非零退出均为 codec error。APNG 原样返回，禁止把
   动画静默压成默认帧。

## 固定版本与供应链边界

### JavaScript oracle

| 层级                | 精确版本                     | 本文用途                                          |
| ------------------- | ---------------------------- | ------------------------------------------------- |
| `imagemin-pngquant` | `10.0.0`, gitHead `e8b6710…` | 公共工厂、options 与错误行为 oracle               |
| `pngquant-bin`      | `9.0.0`, gitHead `5a823f9…`  | 上游 npm 可执行文件选择与 install fallback oracle |
| `execa`             | `8.0.1`                      | stdout、stderr、exit object 行为                  |
| `is-png`            | `3.0.1`                      | 只检查八字节 PNG signature                        |
| `ow`                | `2.0.0`                      | option runtime validator                          |
| `environment`       | `1.1.0`                      | browser guard                                     |
| `uint8array-extras` | `1.5.0`                      | 跨 realm `Uint8Array` 判断                        |

顶层包只声明 caret 范围；表中的传递版本是本次锁文件/注册表解析结果。conformance
夹具必须归档完整 lockfile，不能只写 `imagemin-pngquant@10`。包元数据见
[`package.json`](https://github.com/imagemin/imagemin-pngquant/blob/e8b6710e49ba2979a15d99a4f3be34679dfecc6f/package.json)，
实现见
[`index.js`](https://github.com/imagemin/imagemin-pngquant/blob/e8b6710e49ba2979a15d99a4f3be34679dfecc6f/index.js)。

### Codec 与 Rust 候选

| 组件                 | 精确版本/提交                   | 许可                        | 声明 MSRV | 结论                   |
| -------------------- | ------------------------------- | --------------------------- | --------- | ---------------------- |
| pngquant CLI         | `3.0.3` / `53a332a…`            | GPL-3.0-or-later / 商业许可 | Rust 1.63 | 推荐的固定 sidecar     |
| oracle libimagequant | `imagequant 4.2.2` / `6e98057…` | GPL-3.0-or-later / 商业许可 | Rust 1.63 | 必须随 3.0.3 一起固定  |
| `imagequant`         | `4.4.1` / `24e2956…`            | GPL-3.0-or-later / 商业许可 | Rust 1.65 | 技术候选；当前禁止链接 |
| `imagequant-sys`     | `4.1.0`                         | GPL-3.0-or-later            | Rust 1.63 | 没有许可优势，不推荐   |
| Quantette            | `0.6.0`                         | MIT OR Apache-2.0           | Rust 1.90 | alpha 与 MSRV 均不满足 |

pngquant 的版本、许可和 MSRV 见固定提交的
[`Cargo.toml`](https://github.com/kornelski/pngquant/blob/53a332a58f44357b6b41842a54d74aa1e245913d/Cargo.toml)；
当前 imagequant 见
[`Cargo.toml`](https://github.com/ImageOptim/libimagequant/blob/24e2956a37cd7ad1f4b81c0e20318e3239eb71dc/Cargo.toml)
与
[`CHANGELOG`](https://github.com/ImageOptim/libimagequant/blob/24e2956a37cd7ad1f4b81c0e20318e3239eb71dc/CHANGELOG.md)。
MSRV 只是组件声明；实际门禁还须固定 `Cargo.lock` 并测试所有 feature/target。当前
`imagequant` 默认 `threads` feature 依赖 Rayon，项目解析到的 Rayon 1.12 自身要求
Rust 1.85，因此仍在项目 1.88 内。

## `imagemin-pngquant@10.0.0` 的精确契约

### 调用与输入

公共形状是：

```ts
imageminPngquant(options?)(input: Uint8Array): Promise<Uint8Array>
```

- 在 browser 环境，调用工厂即抛出
  `Error("This package does not work in the browser.")`。
- 返回的函数只接受 `Uint8Array`；错误文本是
  `Expected a Uint8Array, got ${typeof input}`。Node `Buffer` 是其子类，跨 realm 的
  `Uint8Array` 也由 `uint8array-extras` 接受。
- 类型检查先于 PNG 检测。PNG 检测仅比较标准八字节 signature，不解析 IHDR、CRC
  或 IEND。因此“signature 正确但内容损坏”的输入会进入 CLI，并通常以非 99 错误
  reject。
- 非 PNG 返回完全相同的输入引用；更重要的是，它发生在任何 option 校验之前。
  所以 `pngquant({speed: 0})(nonPng)` 在 oracle 中不会报错。
- 未知 option 被静默忽略。`options = null` 或错误 primitive 的异常只会在 PNG 路径
  访问属性时暴露。

这些细节来自固定提交的
[`index.js`](https://github.com/imagemin/imagemin-pngquant/blob/e8b6710e49ba2979a15d99a4f3be34679dfecc6f/index.js)
及
[`is-png@3.0.1`](https://github.com/sindresorhus/is-png/tree/b410d17af838761814e6e3f35359fe2fd41a5698)。

### Options、默认值和 CLI 映射

| option      | oracle 校验                            | CLI 参数                                                | 实际默认/边界                       |
| ----------- | -------------------------------------- | ------------------------------------------------------- | ----------------------------------- |
| `speed`     | integer `1..11`                        | `--speed N`                                             | 未传不加 flag；3.0.3 默认 4         |
| `strip`     | boolean                                | `true` 才加 `--strip`                                   | 默认 false；`false` 与未传相同      |
| `quality`   | 长度恰为 2 的 number 数组，每项 `0..1` | 两项分别 `Math.round(x * 100)` 后传 `--quality min-max` | 不检查 `min <= max`                 |
| `dithering` | number `0..1` 或字面量 `false`         | number -> `--floyd=x`; false -> `--ordered`             | 默认 Floyd level 1                  |
| `posterize` | 只校验为 number                        | `--posterize value`                                     | CLI/libimagequant 真正范围为 `0..4` |

注意以下容易误读的边界：

- README 写 speed 默认 4，而 `index.d.ts` 的注释曾写默认 3。代码不设置默认，真实值
  由被选中的 binary 决定；对固定 3.0.3 应写 4，不应沿用类型注释。
- pngquant 3.0.3 的 speed 10 会启用 imagequant speed 10 与 fast compression；speed
  11 还会强制 dithering 0。若用户同时给 `speed: 11` 和 dithering，最终行为由 CLI
  参数解析/执行顺序决定，必须由 oracle 测试固定。
- `--ordered` 并非有序矩阵抖动。3.0.3 把 `--ordered`/`--nofs` 当作 Floyd level 0
  的 alias；`dithering: false` 与 `dithering: 0` 在该版本语义相同。
- `quality` 使用 JavaScript `Math.round`，Rust 端不得用 ties-to-even 或直接 float
  乘法替代。`[0.005, ...]` 一类边界要进入测试。
- oracle 不先拒绝反向 quality 区间，交给 CLI 以普通非零 code 报错。
- oracle 对 `posterize` 不做 integer/range 限制。3.0.3 内部仅 `0..4` 有意义；为避免
  不同 C/Rust CLI 对小数/非法字符串的解析差异，新增 native API 应收紧为
  `0 | 1 | 2 | 3 | 4`，但兼容入口要记录这是有意差异。

CLI 参数实现见 pngquant 3.0.3 的
[`bin.rs`](https://github.com/kornelski/pngquant/blob/53a332a58f44357b6b41842a54d74aa1e245913d/src/bin.rs)；
测试基线见上游
[`test.js`](https://github.com/imagemin/imagemin-pngquant/blob/e8b6710e49ba2979a15d99a4f3be34679dfecc6f/test.js)。

### 输出与错误

- sidecar 从 stdin 读 PNG、向 stdout 写 PNG。正常 code `0` 返回 stdout bytes。
- libimagequant 无法达到 `quality[0]` 时，pngquant 返回 code `99`。CLI 在流模式下
  可能仍向 stdout 写一个 truecolor 重编码结果，但 oracle 丢弃它并返回原输入引用。
- 任意其他 execa error 都原样抛出：binary 不存在、spawn failure、signal、参数错误、
  损坏 PNG、stdout buffer failure 和其他非零 exit 都不降级为输入。
- oracle 使用 `maxBuffer: Infinity`，没有 timeout 或内存防线。本项目必须增加资源
  限制；这是明确的安全差异，不能伪装成逐字节完全兼容。

## `pngquant-bin@9.0.0` 并不是一个 codec 版本

固定提交
[`5a823f9f6fa30af532ce47e3881b41103995ea44`](https://github.com/imagemin/pngquant-bin/tree/5a823f9f6fa30af532ce47e3881b41103995ea44)
的 platform mapping 与实际 artifact 如下：

| npm 选择           | 实际 binary 版本         | 说明                                             |
| ------------------ | ------------------------ | ------------------------------------------------ |
| macOS x64/arm64    | `3.0.3`                  | 单个 universal Mach-O；Cocoa/CoreGraphics reader |
| Linux x64          | `3.0.3`                  | 预构建 ELF                                       |
| Windows x64        | `2.17.0`                 | 预构建 PE                                        |
| Linux x86          | `2.10.1`                 | 预构建 ELF                                       |
| FreeBSD x64        | `2.5.2`                  | 预构建 ELF                                       |
| 预构建件不可运行时 | `2.16.0` source fallback | `configure && make`，可拾取系统 libimagequant    |

包没有 Linux arm64、Linux musl 或 Windows arm64 的明确映射。install script 会先执行
`--version`，失败后编译 `vendor/source/pngquant.tar.gz`；该 archive 是 **2.16.0**，
不是 macOS/Linux x64 binary 的 3.0.3。选择逻辑见
[`lib/index.js`](https://github.com/imagemin/pngquant-bin/blob/5a823f9f6fa30af532ce47e3881b41103995ea44/lib/index.js)
和
[`lib/install.js`](https://github.com/imagemin/pngquant-bin/blob/5a823f9f6fa30af532ce47e3881b41103995ea44/lib/install.js)。

因此 release manifest 至少记录：

- npm 包 integrity 与 `pngquant-bin` gitHead；
- 可执行文件 SHA-256、byte length、`pngquant --version` 输出；
- target triple、libc/minimum OS、动态库清单；
- pngquant 与 libimagequant 的精确源码提交、构建器镜像 digest、编译 flags；
- GPL-3.0-or-later 文本、copyright notices 与对应源码获取方式。

当前 `THIRD_PARTY_NOTICES.md` 若声称 npm 包自带 3.0.3 binary 的“corresponding source”
是不成立的：内置 2.16.0 archive 不能替代 3.0.3 + `6e98057…` 的对应源码。这是发布
阻断项，不只是文档瑕疵。

## 为什么选择 CLI sidecar

### `imagequant@4.4.1`

它是首选的**技术候选**：纯 Rust 高层 API，无需手写 C 指针生命周期；支持 alpha、
gamma-aware/premultiplied 色差、quality floor、posterization、Floyd-Steinberg dithering
和进度 callback。关键行为如下：

- `Attributes::new()` 默认 speed 4、quality `0..100`、最多 256 colors；
- `set_speed` 只接受 `1..10`，CLI speed 11 必须由 adapter 实现为 speed 10 +
  dithering 0；
- `set_quality(min, target)` 要求 `target >= min`，低于 floor 返回
  `Error::QualityTooLow`，其兼容整数值为 99；
- `set_min_posterization` 只接受 `0..4`；
- `QuantizationResult` 默认 dithering level 1，`set_dithering_level` 接受 `0..1`；
- `new_image` 接受 RGBA pixel 与 gamma，不负责 PNG decode/encode；PNG chunk、bit depth、
  ICC/gAMA 与 metadata 策略仍需另一个库实现；
- 默认 `threads` feature 使用 Rayon 全局池；可通过 `default-features = false` 禁用。
  pixel row callback 可被多线程、多次调用，必须为 `Send + Sync` 且幂等；
- progress callback 可中止 quantization/remap，但不能替代 decode、encode 和分配前的
  hard cap。

API 依据固定提交的
[`attr.rs`](https://github.com/ImageOptim/libimagequant/blob/24e2956a37cd7ad1f4b81c0e20318e3239eb71dc/src/attr.rs)、
[`quant.rs`](https://github.com/ImageOptim/libimagequant/blob/24e2956a37cd7ad1f4b81c0e20318e3239eb71dc/src/quant.rs)
和
[`error.rs`](https://github.com/ImageOptim/libimagequant/blob/24e2956a37cd7ad1f4b81c0e20318e3239eb71dc/src/error.rs)。

拒绝直接采用的首要原因是许可，不是性能：crate 是 GPL-3.0-or-later。即使法律上
对进程边界的解释仍应由发布方律师确认，工程上也应让 GPL executable 与 MIT addon
成为两个可识别的作品，并履行 executable 发行义务。若取得商业许可，可另开 ADR
评估 in-process `imagequant 4.4.1`；它包含 4.4 的 palette-quality 改动，必须重新跑
视觉门禁，不能冒充 4.2.2 oracle。

### `imagequant-sys@4.1.0` 与传统 C FFI

`imagequant-sys` 是官方 C ABI 包装，但底层仍是同一 Rust `imagequant`，许可仍为 GPL。
它额外引入 raw pointer、callback unwind、allocator 与 panic/abort 边界，却不提供质量、
性能或许可优势。旧 C libimagequant 2.x 还会带来另一套 ABI/线程/构建矩阵。除非已有
必须复用 C ABI 的宿主，否则不选 sys/传统 FFI。

### `quantette@0.6.0`

Quantette 使用 Wu/k-means 与 Oklab，许可宽松，适合研究 opaque 图片的吞吐和 palette
质量；但官方
[`Benchmarks and Accuracy`](https://github.com/IanManske/quantette/blob/v0.6.0/docs/Benchmarks%20and%20Accuracy.md)
明确写明目前不支持 alpha。它还没有 pngquant 的 quality floor、speed `1..11`、
posterize 和 alpha-aware adaptive dithering 契约；默认 features 也启用 Rayon，edition
2024/MSRV 1.90 与本项目当前 1.88 不兼容。

因此本阶段不依赖、不暴露。若未来新增 `quantette()`：

1. API 名称和文档必须表明是不同引擎，不承诺 pngquant parity；
2. 解析后扫描 alpha，任一像素非 255 就 pass-through 或 typed `Unsupported`；
3. 不得将透明像素预合成到某个背景，也不得丢失 alpha=0 像素的 hidden RGB 后声称
   RGBA 保真；
4. 等项目 MSRV 至少提升到 1.90，再固定 feature、Rayon 与 lockfile。

## Alpha、颜色、metadata 与 APNG

PNG alpha 既可能来自 RGBA/GA channel，也可能来自 truecolor/grayscale `tRNS`，还可能
是 indexed palette 的逐项 `tRNS`。PNG 存储的是 unassociated alpha；量化器内部可以
用 premultiplied/gamma-aware 距离，但输出必须恢复正确的 palette alpha。规范依据
[`PNG Third Edition`](https://www.w3.org/TR/png-3/)。

视觉测试不能只比较透明像素的 RGB：alpha=0 的 hidden RGB 对当前背景不可见，半透明
边缘在不同背景上误差完全不同。每个透明 fixture 都必须：

- 分别在黑、白和 8 px 棋盘背景上做线性光合成，再计算 SSIM/DSSIM 与 ΔE00；
- 单独计算 alpha MAE、p95/p99 absolute error；
- 检查原本完全不透明的像素不会意外变透明，alpha=0 不会变为明显可见；
- 包含彩色 hidden RGB、alpha ramp、1 px antialias、soft shadow、`tRNS` 与 palette
  alpha，而不只是一张 RGBA logo。

`strip:false` 的兼容含义是“不传 `--strip`”，并不等于字节保留所有 chunk。像素被修改
后，未知 ancillary chunk 必须遵守 PNG safe-to-copy bit；color profile、gAMA/cHRM/sRGB、
文本与物理尺寸要按 decoder/encoder 能力建立白名单。`strip:true` 删除可选 metadata，
但不得破坏正确解码所需的颜色语义。pngquant 的 macOS Cocoa reader 即使没有
`--strip` 也不能保持与 libpng 路径完全相同的 metadata，因此跨 OS 不承诺 metadata
byte parity。

APNG 含 `acTL`/`fcTL`/`fdAT`。pngquant 3 会只输出默认 image，造成不可逆动画丢失；
Phase 3 检测到 `acTL` 后必须返回原输入引用。未来只有在逐帧 palette、dispose/blend、
delay、loop 和 output APNG 全部有 oracle 后，才能改变这一决定。

## 推荐实现与 API 边界

```text
pngquant(options) factory
  -> validate documented options
  -> plugin(input)
     -> Uint8Array + PNG signature check
     -> bounded chunk/IHDR/APNG preflight
     -> version-fingerprinted pngquant 3.0.3 sidecar
     -> exit 0: bounded stdout
        exit 99: exact original input reference
        otherwise: ERR_IMAGEMIN_CODEC
```

推荐依赖钉住：

```json
{
  "dependencies": {
    "pngquant-bin": "9.0.0"
  },
  "devDependencies": {
    "imagemin-pngquant": "10.0.0"
  }
}
```

这两个 npm 版本用于兼容与测试，不等于允许任意 artifact 上线。生产 sidecar 必须额外
固定 pngquant `3.0.3`、libimagequant `6e980576…`、每 target SHA-256，并在首次执行前
验证 `--version === 3.0.3`。发现其他版本时 fail closed，不自动切换算法。

建议把 API 分成两种承诺：

- `pngquant()`：尽量复刻 `imagemin-pngquant@10`，保留 `0..1` quality/dithering、
  exit 99 和非 PNG identity；安全上额外有 limits 与 APNG pass-through。
- 未来 native profile：可收紧 posterize 类型、拒绝未知 option、暴露 typed errors 和
  pipeline policy，但必须另命名/标注，不把差异描述为 oracle 行为。

当前实现选择在 factory 同步拒绝未知/非法 option；这意味着 oracle 中“非 PNG 先
pass-through，再忽略非法 option”的边缘行为不再成立。这个更安全的差异应保持公开
测试和文档，不应在测试里误写成完全兼容。直接 JS 调用时也应补齐非 `Uint8Array` 的
runtime TypeError，否则 TypeScript 类型不能覆盖 JavaScript 消费者。

## Resource limits

### 每张图片的初始硬上限

| 资源                     |               推荐默认上限 | 处置                                          |
| ------------------------ | -------------------------: | --------------------------------------------- |
| compressed input         |                    256 MiB | `ERR_IMAGEMIN_INVALID_INPUT`，启动进程前拒绝  |
| width / height           |                  各 16,384 | 启动进程前拒绝                                |
| pixels                   | 67,108,864（64 Mi pixels） | 启动进程前拒绝                                |
| decoded RGBA working set |               512 MiB 预算 | 计入同进程并发 budget                         |
| 单 ancillary chunk       |                      8 MiB | 不保留或拒绝；不得按声明长度盲分配            |
| retained metadata total  |                     16 MiB | 超出则 typed error 或按明确 strip policy 丢弃 |
| stdout                   |                    512 MiB | kill + codec/resource error                   |
| stderr                   |                      1 MiB | kill + codec/resource error                   |
| wall time                |                      120 s | kill process tree + timeout error             |

`width * height` 必须用溢出安全乘法；先验证 PNG signature、IHDR 长度/位置、合法
width/height、chunk declared length、文件边界、CRC/ordering，再读取尺寸。不能只从固定
offset 取 8 bytes。IDAT 解压还应受到 decoded bytes 上限约束，避免小输入炸弹。

全局调度初值：同时运行的 pngquant 进程不超过 `min(availableParallelism, 4)`，所有
活跃任务估算 decoded bytes 总和不超过 512 MiB。两个门同时满足才调度；这比单纯限制
worker 数更能处理超大 PNG。服务部署可以下调，公共 codec option 不允许解除 hard
cap；可信离线 pipeline 只能通过独立 policy 显式提高。

timeout/output/stderr 超限后必须关闭 stdin/stdout/stderr 并终止整个 process tree。
POSIX 可使用独立 process group，Windows 使用 Job Object；只 `child.kill()` 不是通用的
tree cancellation。记录耗时、input/output bytes、峰值预算、exit/signal、binary hash，
但 stderr 要做长度限制与敏感路径清洗。

## Corpus 与 conformance 设计

### 固定上游夹具

1. `imagemin-pngquant` 固定提交的 `fixture.png` 与 `test.js`，覆盖默认、完整 option、
   非 PNG 和错误输入。
2. pngquant 3.0.3 的 `test/img/test.png`、`metadata.png` 和 `test.sh`，特别固定 quality
   floor exit 99。
3. libimagequant `6e98057…` 与当前 4.4.1 的 synthetic/unit fixtures，用于区分 oracle
   行为和候选升级变化。
4. [PNGSuite](http://www.schaik.com/pngsuite/) 的合法 color type、bit depth、interlace、
   gamma 与 transparency 样本；非法集合只验证 error/资源边界。
5. 一组真实 APNG，检查 frame count、delay、dispose、blend、loop 在 pass-through 后
   byte-identical。

### 真实 corpus

维护至少 500 张有许可证/已脱敏的真实 PNG，并提交只读 manifest：source、license、
SHA-256、尺寸、color type、bit depth、alpha、profile、metadata、是否动画。按以下层分层
抽样，任何一层都不能被大量普通截图淹没：

- opaque 照片与复杂纹理；
- UI screenshot、文字、线稿、icon、gradient；
- indexed PNG、grayscale、1/2/4/8/16-bit、Adam7；
- RGBA/GA、truecolor `tRNS`、palette `tRNS`、soft shadow 与 antialias；
- iCCP/sRGB/gAMA/cHRM、EXIF/text/pHYs 与 unknown safe/unsafe ancillary chunks；
- tiny image、超宽/超高、接近资源上限和高压缩比 adversarial image。

另建程序化透明套件：alpha 0/1/254/255、水平/径向 alpha ramp、彩色 hidden RGB、
1 px 红/绿/蓝边缘、黑白文字、阴影，分别在黑/白/棋盘背景验证。这套 fixture 应保存
生成参数与无损 reference，而不是把有损输出本身当金样。

### Option matrix

核心笛卡尔积：

- speed：未传、`1`、`4`、`10`、`11`；
- quality：未传、`[0,1]`、`[0.3,0.5]`、`[0.8,1]`、`[1,1]`，以及会触发
  `Math.round` 边界的值；
- dithering：未传、`false`、`0`、`0.5`、`1`；
- posterize：未传、`0`、`1`、`2`、`3`、`4`；
- strip：未传、`false`、`true`。

全量 corpus 用 pairwise 覆盖，透明/quality-floor/metadata 小集跑完整笛卡尔积。再加非法
类型、NaN/Infinity、反向 quality、unknown option、signature-only malformed、binary
missing、timeout、stdout/stderr overflow 和 signal 测试。

### 语义与视觉门槛

相同 OS、相同 executable SHA 的 sidecar conformance 优先逐字节比较 oracle；若 encoder
包含允许变化的 chunk/order，则解码 RGBA、palette 与 metadata 语义必须相同。跨 OS 或
替代 engine 不要求 byte parity，但必须同时对原图和固定 oracle 比较。

候选 engine 的初始 release gate：

- 所有输出可解码，尺寸相同，静态输入保持单帧；indexed 输出 palette 不超过 256，
  alpha/tRNS 语义合法；
- oracle exit 99 时 `pngquant()` 必须返回原引用，不接受“更好看所以仍输出”的替代；
- 黑、白、棋盘三个合成背景上，对 99% corpus：候选 DSSIM 不高于
  `max(oracle × 1.10, oracle + 0.0005)`；任一样本不高于 `oracle + 0.003`；
- 三背景 ΔE00：mean 不高于 `oracle + 0.20`，p95 不高于 `oracle + 0.75`，p99 不高于
  `oracle + 1.50`；
- alpha MAE 不高于 `oracle + 0.5/255`，alpha p99 absolute error 不高于
  `oracle + 2/255`；原 alpha=255 的像素不得降到 254 以下，原 alpha=0 不得升到 1
  以上；
- 在候选正常输出的前提下，文件大小 p95 不超过 oracle 105%，任何样本不超过 120%；
  若更大但视觉显著更好，须由单独 benchmark/ADR 接受，不能静默放宽；
- `strip:false/true` 分别通过 chunk 白名单和 PNG safe-to-copy matrix；APNG 必须
  byte-identical pass-through。

这些数值是首轮工程 gate，不是宣称主观“无损”。先在真实 corpus 上记录 oracle 分布，
若阈值需要调整，必须按图层/类别解释，不能只调到新实现通过。quality floor 最终应使用
同一 libimagequant 内部质量判定；ΔE00/SSIM 只用于防止视觉回退，不能替代 code 99。

### 线程、平台与确定性矩阵

至少测试 macOS arm64/x64、Linux glibc x64/arm64、Linux musl x64/arm64、Windows x64/
arm64。每个平台记录 binary hash/version/动态库，并重复：单进程、全局并发上限、CPU
饱和、timeout/cancel、低内存。

如评估 in-process imagequant，分别用 `default-features = false` 单线程与固定大小的
专用 Rayon pool；不要让 N-API worker、pipeline pool 和 imagequant 全局 Rayon 三层
同时扩张。相同 build/input/options 的解码像素结果必须可重复；只在同 encoder/version/
OS 下要求 byte deterministic。TSAN/ASAN 或 Miri 覆盖 callback ownership，panic 不得
跨 N-API/C ABI 边界。

## 分阶段落地门禁

### Phase 3A：兼容 sidecar

- 固定 `imagemin-pngquant 10.0.0` 和完整 npm lock；
- 固定、自建 pngquant 3.0.3 + libimagequant `6e98057…` 的每平台 artifact；
- 实现 signature/IHDR/chunk/APNG preflight、per-asset/global limits；
- option、non-PNG identity、exit 99、alpha 与 metadata conformance 全绿；
- 修正 corresponding-source notice，并由发布/法律负责人签核 GPL 交付物。

### Phase 3B：扩大平台与 corpus

- 六类主要 target 运行统一 artifact/version 门禁；
- 500+ 真实 corpus、透明 synthetic、PNGSuite 和 adversarial 集进入 CI/定期 benchmark；
- 固定性能、内存、视觉和大小基线，连续两次 clean run 无 flaky byte/timeout 差异。

### Phase 3C：可选 native 候选

- 先解决 imagequant 商业许可或明确 GPL 独立发行架构；
- 单独评估 `imagequant 4.4.1` + PNG decoder/encoder，不替换兼容 oracle；
- 通过本文所有质量、alpha、metadata、thread、resource 与平台门禁后再写替换 ADR；
- Quantette 在 alpha 与 MSRV 问题解决前不进入此阶段。

## 最终推荐

Phase 3 的可发布方案是：**精确版本、精确源码、精确 hash 的 pngquant 3.0.3
GPL sidecar + MIT N-API/TypeScript adapter**。`pngquant-bin@9.0.0` 和
`imagemin-pngquant@10.0.0` 只承担兼容 oracle/开发依赖角色。不要直接链接
`imagequant`/`imagequant-sys`，不要用 Quantette 冒充 pngquant，也不要接受未 fingerprint
的 `pngquant-bin` fallback。升级任何一个 codec、decoder、encoder、thread feature 或
平台 artifact，都必须重新通过本文的 corpus、质量、alpha、资源和许可证门禁。
