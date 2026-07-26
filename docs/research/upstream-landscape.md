# imagemin-rs 上游生态与工程结构调研

## 调研范围与基准

- 调研日期：2026-07-17（Asia/Shanghai）。
- 只使用项目官方仓库、官方文档、npm 官方 registry 与 npm downloads API；不使用博客、榜单或第三方教程作为事实来源。
- `fontmin-rs` 基准提交：[`943f0f55`](https://github.com/fontmin-rs/fontmin-rs/tree/943f0f55a258607144cb61223dc642c821c574bc)。
- `imagemin` 基准提交：[`bd305292`](https://github.com/imagemin/imagemin/tree/bd3052923e2f20ae8adad241e59f9b369bbf9fd9)。
- Oxc 基准提交：[`8da04029`](https://github.com/oxc-project/oxc/tree/8da040290cc021376d64e5621e1da4fe214bd14f)。
- Rolldown 基准提交：[`b9823050`](https://github.com/rolldown/rolldown/tree/b9823050bc658ef65105148ea0504d4fbda7fa4c)。
- 本仓库调研前只有根级 `README.md`，没有研究笔记约定，因此按任务约定新建本文件 `docs/research/upstream-landscape.md`。

## 结论摘要

1. **公开 JS API 应优先兼容 imagemin 的数据协议，而不是复制它的内部实现。** 保留默认导出的 `imagemin(input, options?)`、`imagemin.buffer(data, options?)`、顺序插件管线和 `Promise<Uint8Array>` 语义，Rust/N-API 细节放在公开包下面。
2. **目录分层采用 fontmin-rs 与 Oxc 的清晰边界，发布方式采用 napi-rs/Oxc/Rolldown 的当前做法。** 建议分为纯 Rust `crates/*`、薄绑定 `napi/imagemin`、稳定 JS 门面 `packages/imagemin`、VitePress `docs`、跨层样本 `fixtures`、仓库工具 `tasks`/`scripts`。平台 npm 目录由 CI 生成，不常驻源码树。
3. **图片压缩不能照搬 fontmin-rs 当前的同步 binding。** 图片 codec 是明显的 CPU 密集工作；按 napi-rs 决策表应使用 `AsyncTask` 或独立受控线程池，而不是在同步原生函数外只套一层 JavaScript `async`。
4. **首轮插件实现顺序应以一个固定统计窗口排序。** 在 2025-07-16 至 2026-07-15 的 npm 下载量中，指定的六个插件顺序为 `svgo`、`gifsicle`、`pngquant`、`mozjpeg`、`webp`、`avif`。如果把经典无损插件也纳入，则 `optipng` 排在 `gifsicle` 后、`pngquant` 前，`jpegtran` 排在 `mozjpeg` 后、`webp` 前。
5. **“流行”与“维护活跃”必须分别记录。** `imagemin-gifsicle` 下载量很高，但最新 npm 版本发布于 2020 年；`imagemin-svgo` 下载量最高且在 2026 年发布了新版本。实现优先级可由下载量决定，但兼容目标必须固定到明确的上游版本。

## fontmin-rs：可复用的工程组织

### Workspace 与交付边界

`fontmin-rs` 使用两套不必镜像的 workspace：

- Cargo workspace 包含 `apps/*`、`crates/*`、`napi/*` 和 `wasm/fontmin-core`：[根 `Cargo.toml`](https://github.com/fontmin-rs/fontmin-rs/blob/943f0f55a258607144cb61223dc642c821c574bc/Cargo.toml#L1-L3)。
- pnpm workspace 包含 `docs`、`packages/*`、`napi/*`、`npm/*`、`wasm/*`、`tasks/*` 和 `examples/*`：[pnpm workspace](https://github.com/fontmin-rs/fontmin-rs/blob/943f0f55a258607144cb61223dc642c821c574bc/pnpm-workspace.yaml#L1-L8)。

它把职责分成以下层次：

| 目录                          | 职责                                                     | 对 imagemin-rs 的启示                                        |
| ----------------------------- | -------------------------------------------------------- | ------------------------------------------------------------ |
| `crates/*`                    | 纯 Rust 领域类型、格式实现、pipeline、插件协议、测试工具 | codec、格式探测、pipeline、诊断不依赖 Node                   |
| `napi/fontmin`                | `cdylib` 与 napi-rs 参数/结果转换                        | binding 保持薄，只做转换、任务调度、错误映射                 |
| `packages/fontmin`            | 稳定 JS/TS API、插件编排、presets、兼容类、原生加载器    | imagemin 兼容 API 在 JS 门面完成，避免把 npm 形状固化进 Rust |
| `npm/*`                       | 每个平台一个二进制 npm package                           | 发布模型可借鉴，但目录生成方式应改用 napi-rs 当前推荐方案    |
| `docs`、`fixtures`、`scripts` | 文档站、真实样本、发布与打包校验                         | 把站点、黄金样本和 release preflight 都当成产品代码          |

N-API crate 是标准 `cdylib`，依赖 napi-rs 和 Rust 门面 crate：[binding `Cargo.toml`](https://github.com/fontmin-rs/fontmin-rs/blob/943f0f55a258607144cb61223dc642c821c574bc/napi/fontmin/Cargo.toml#L10-L20)。公开包没有直接暴露 `.node` 文件，而是把生成 loader 封装在内部，再提供主入口及 `./plugins`、`./presets`、`./compat` 子路径：[公开包清单](https://github.com/fontmin-rs/fontmin-rs/blob/943f0f55a258607144cb61223dc642c821c574bc/packages/fontmin/package.json#L28-L53)。

### JS 接口与插件协议

公开包同时提供底层函数、`optimize`、插件工厂、presets 和兼容类：[入口导出](https://github.com/fontmin-rs/fontmin-rs/blob/943f0f55a258607144cb61223dc642c821c574bc/packages/fontmin/src/index.ts#L1-L36)。兼容类保留 `src().use().dest().run()` 形态，并提供 Promise 风格的 `runAsync()`：[兼容层](https://github.com/fontmin-rs/fontmin-rs/blob/943f0f55a258607144cb61223dc642c821c574bc/packages/fontmin/src/compat.ts#L17-L74)。

其 JS 插件协议比原版 imagemin 更接近构建工具：包含 `name`、`enforce`、`buildStart`、`transform`、`generateBundle`、`buildEnd`，hook 可以同步或异步；内置插件另有可序列化 `native` 描述：[插件类型](https://github.com/fontmin-rs/fontmin-rs/blob/943f0f55a258607144cb61223dc642c821c574bc/packages/fontmin/src/types.ts#L49-L89)。

对 imagemin-rs 的推荐是分两层：

- **兼容层**继续接受最小协议 `(input: Uint8Array) => Uint8Array | Promise<Uint8Array>`，以便现有 imagemin 插件可组合。
- **原生扩展层**可以有带 `name`、codec ID、可序列化 options 的描述，但不要要求第三方 imagemin 插件实现生命周期 hooks。

### 不应原样照搬的异步模型

fontmin-rs 的多数原生函数仍是同步 `Buffer -> Buffer`，例如 `subsetTtf`、`ttfToWoff` 与 `ttfToWoff2`：[binding 实现](https://github.com/fontmin-rs/fontmin-rs/blob/943f0f55a258607144cb61223dc642c821c574bc/napi/fontmin/src/lib.rs#L143-L203)。公开包的 Promise 形 runtime 直接调用这些同步函数，没有把 CPU 工作移出 Node 主线程：[runtime wrapper](https://github.com/fontmin-rs/fontmin-rs/blob/943f0f55a258607144cb61223dc642c821c574bc/packages/fontmin/src/optimize-runtime.ts#L100-L132)。

这对短小字体操作可能可接受，但不是图片编码的推荐默认值。图片压缩应从第一版就把同步底层函数与异步公共入口区分开。

### 测试与 VitePress 文档

测试分层值得直接复用：

- Rust crate 单元测试与集成测试；
- N-API binding 使用真实 fixture 验证 Buffer、输出格式和异常：[binding tests](https://github.com/fontmin-rs/fontmin-rs/blob/943f0f55a258607144cb61223dc642c821c574bc/napi/fontmin/tests/api.test.ts#L1-L80)；
- 公开 JS API、插件、CLI、runtime/fallback 测试：[public API tests](https://github.com/fontmin-rs/fontmin-rs/blob/943f0f55a258607144cb61223dc642c821c574bc/packages/fontmin/tests/api.test.ts#L14-L47)；
- native/WASM 共用契约测试：[runtime contract](https://github.com/fontmin-rs/fontmin-rs/blob/943f0f55a258607144cb61223dc642c821c574bc/packages/fontmin/tests/runtime-contract.test.ts#L14-L104)；
- 包导出、tarball 内容和平台 package metadata 测试：[package tests](https://github.com/fontmin-rs/fontmin-rs/blob/943f0f55a258607144cb61223dc642c821c574bc/packages/fontmin/tests/package.test.ts#L145-L183)；
- Linux/macOS/Windows 与多 Node 版本矩阵，以及 browser、package smoke、release readiness jobs：[CI](https://github.com/fontmin-rs/fontmin-rs/blob/943f0f55a258607144cb61223dc642c821c574bc/.github/workflows/ci.yml#L64-L90)。

VitePress 是独立 `docs` workspace，包含 `vitepress dev/build`、Vitest、Playwright、Vue 组件测试：[docs package](https://github.com/fontmin-rs/fontmin-rs/blob/943f0f55a258607144cb61223dc642c821c574bc/docs/package.json#L1-L30)。站点配置同时支持中英文 locales、独立 nav/sidebar、local search、编辑链接和行号：[VitePress config](https://github.com/fontmin-rs/fontmin-rs/blob/943f0f55a258607144cb61223dc642c821c574bc/docs/.vitepress/config.ts#L5-L149)。文档构建与 playground 浏览器测试都是 CI gate，而不是部署时才发现问题。

## imagemin 核心：应兼容的协议

当前 `imagemin@9.0.1` 是 ESM-only、要求 Node `>=18`：[package.json](https://github.com/imagemin/imagemin/blob/bd3052923e2f20ae8adad241e59f9b369bbf9fd9/package.json)。它公开两个入口：

```ts
type ImageminPlugin = (input: Uint8Array) => Uint8Array | Promise<Uint8Array>;

interface ImageminResult {
  data: Uint8Array;
  sourcePath: string;
  destinationPath?: string;
}

declare function imagemin(
  input: string[],
  options?: {
    destination?: string;
    glob?: boolean;
    plugins?: ImageminPlugin[];
  },
): Promise<ImageminResult[]>;

declare namespace imagemin {
  function buffer(data: Uint8Array, options?: { plugins?: ImageminPlugin[] }): Promise<Uint8Array>;
}
```

以上类型是根据上游运行时与 README 整理的兼容原型，不是上游发布的声明文件；当前包只发布 `index.js`。来源：[核心实现](https://github.com/imagemin/imagemin/blob/bd3052923e2f20ae8adad241e59f9b369bbf9fd9/index.js)、[README API](https://github.com/imagemin/imagemin/blob/bd3052923e2f20ae8adad241e59f9b369bbf9fd9/readme.md#api)。

核心行为：

- 默认把 `input` 当 glob 列表；`glob: false` 时按原路径处理。
- 不提供插件时返回原数据的 `Uint8Array` 副本。
- 插件通过 `p-pipe` 按数组顺序串行执行；不同文件通过 `Promise.all` 并发处理。
- `destination` 缺省时不写盘；存在时创建父目录并写入。
- 文件结果包含 `sourcePath`、可选 `destinationPath` 和 `data`。
- 输出被统一归一化为 `Uint8Array`，用于逐步摆脱历史 `Buffer` 假设。
- 单文件出错时，上游会给错误消息附加处理上下文；测试覆盖损坏图片、错误输入、空插件、glob、写盘、WebP 扩展名和 junk 文件过滤：[核心测试](https://github.com/imagemin/imagemin/blob/bd3052923e2f20ae8adad241e59f9b369bbf9fd9/test.js)。

建议把这些行为做成 JS 兼容契约测试；Rust 核心不负责 glob、路径、junk 文件和 npm 插件调用。

## 插件生态、流行度与维护信号

### 可复现的衡量方法

本表使用 npm 官方 downloads API 的同一滚动一年窗口，避免混用 GitHub stars、周下载量和累计下载量。复跑命令：

```sh
curl 'https://api.npmjs.org/downloads/point/last-year/imagemin,imagemin-mozjpeg,imagemin-pngquant,imagemin-svgo,imagemin-gifsicle,imagemin-webp,imagemin-avif,imagemin-jpegtran,imagemin-optipng'
```

本次 API 返回窗口为 `2025-07-16` 至 `2026-07-15`。版本和发布时间取 npm 官方 package metadata；npm 对 package metadata 的字段定义见 [Public Registry API](https://github.com/npm/registry/blob/main/docs/REGISTRY-API.md) 与 [package metadata 文档](https://github.com/npm/registry/blob/main/docs/responses/package-metadata.md)。

| 排名 | 包                  | 最近一年下载量 | latest / 发布时间     | 所有权与维护信号                                        | 推荐阶段            |
| ---: | ------------------- | -------------: | --------------------- | ------------------------------------------------------- | ------------------- |
|    — | `imagemin`          |     51,484,025 | `9.0.1` / 2025-03-07  | imagemin 官方组织；核心兼容基准                         | Phase 0             |
|    1 | `imagemin-svgo`     |     30,101,690 | `12.0.0` / 2026-02-24 | 官方组织，指定集合中发布最活跃                          | Phase 1             |
|    2 | `imagemin-gifsicle` |     26,444,891 | `7.0.0` / 2020-01-21  | 官方组织；高使用量但 npm 版本陈旧                       | Phase 2             |
|    3 | `imagemin-optipng`  |     26,303,448 | `8.0.0` / 2020-05-24  | 官方组织；若支持经典无损 PNG，应在 pngquant 前          | Phase 2（可选扩展） |
|    4 | `imagemin-pngquant` |     19,612,115 | `10.0.0` / 2024-05-07 | 官方组织；当前版本 Node `>=18` 且带类型                 | Phase 3             |
|    5 | `imagemin-mozjpeg`  |     18,426,933 | `10.0.0` / 2021-12-17 | 官方组织；流行但发布较久                                | Phase 4             |
|    6 | `imagemin-jpegtran` |     13,418,564 | `8.0.0` / 2024-09-25  | 官方组织；无损 JPEG，可作为 mozjpeg 后的补充            | Phase 4（可选扩展） |
|    7 | `imagemin-webp`     |      9,689,057 | `8.0.0` / 2023-01-27  | 官方组织                                                | Phase 5             |
|    8 | `imagemin-avif`     |        144,293 | `0.1.6` / 2024-01-24  | 社区包 `delfimov/imagemin-avif`，不在 imagemin 官方组织 | Phase 6             |

逐包一手数据：[合并下载查询](https://api.npmjs.org/downloads/point/last-year/imagemin,imagemin-mozjpeg,imagemin-pngquant,imagemin-svgo,imagemin-gifsicle,imagemin-webp,imagemin-avif,imagemin-jpegtran,imagemin-optipng)、[`imagemin`](https://registry.npmjs.org/imagemin)、[`imagemin-svgo`](https://registry.npmjs.org/imagemin-svgo)、[`imagemin-gifsicle`](https://registry.npmjs.org/imagemin-gifsicle)、[`imagemin-optipng`](https://registry.npmjs.org/imagemin-optipng)、[`imagemin-pngquant`](https://registry.npmjs.org/imagemin-pngquant)、[`imagemin-mozjpeg`](https://registry.npmjs.org/imagemin-mozjpeg)、[`imagemin-jpegtran`](https://registry.npmjs.org/imagemin-jpegtran)、[`imagemin-webp`](https://registry.npmjs.org/imagemin-webp)、[`imagemin-avif`](https://registry.npmjs.org/imagemin-avif)。

下载量会包含直接安装、脚手架、CI 缓存失效和传递依赖，不能解释为独立用户数。因此本表只适合确定“先兼容谁”，不适合判断 codec 技术质量。

### 插件接口与兼容面

官方插件普遍使用同一工厂协议：`plugin(options?)(input)`，返回 `Promise<Buffer | Uint8Array>`。imagemin-rs 应在 JS 层接受 `Uint8Array`，允许 Node `Buffer` 输入，并统一输出 `Uint8Array`；原生内置插件的 options 类型应显式定义。

| 插件                | 上游接口和主要 options                                                                                                                                                                                                      | 实现时的兼容重点                                                                                                  |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `imagemin-svgo`     | `imageminSvgo(options?)(buffer)`；options 直接传给 SVGO。[官方 README](https://github.com/imagemin/imagemin-svgo#api)                                                                                                       | SVGO 的插件配置面很大且随版本演进；应先声明固定兼容版本，不承诺一次性重现所有 SVGO 插件                           |
| `imagemin-gifsicle` | `imageminGifsicle(options?)(buffer)`；主要是 `interlaced`、`optimizationLevel`、`colors`。[官方仓库](https://github.com/imagemin/imagemin-gifsicle)                                                                         | 动画帧、透明度、循环次数、损坏输入与 no-op 输出必须用真实 GIF fixtures 验证                                       |
| `imagemin-optipng`  | `imageminOptipng(options?)(buffer)`；主要是 `optimizationLevel`、`bitDepthReduction`、`colorTypeReduction`、`paletteReduction`。[官方仓库](https://github.com/imagemin/imagemin-optipng)                                    | 这是无损 PNG 路线，不应与 pngquant 的有损调色板量化混为一个选项                                                   |
| `imagemin-pngquant` | `imageminPngquant(options?)(input)` -> `Promise<Uint8Array>`；`speed`、`strip`、`quality: [min,max]`、`dithering`、`posterize`。[官方 README](https://github.com/imagemin/imagemin-pngquant#api)                            | 质量区间是 `0..1`，与 JPEG/WebP 常见的 `0..100` 不同；低于最小质量时的“不输出/报错”语义要先固定                   |
| `imagemin-mozjpeg`  | `imageminMozjpeg(options?)(buffer)`；`quality`、`progressive`、`revert`、`fastCrush`、`dcScanOpt`、`trellis`、`tune`、`arithmetic`、`dct`、`quantTable` 等。[官方 README](https://github.com/imagemin/imagemin-mozjpeg#api) | 第一版至少稳定支持常用 `quality`、`progressive`；其余选项应逐项由 golden test 证明，不能静默忽略                  |
| `imagemin-jpegtran` | `imageminJpegtran(options?)(buffer)`；主要是 `progressive`、`arithmetic`。[官方仓库](https://github.com/imagemin/imagemin-jpegtran)                                                                                         | 明确这是无损重编码/优化，与 mozjpeg 的有损质量控制分开                                                            |
| `imagemin-webp`     | `imageminWebp(options?)(buffer)`；`preset`、`quality`、`alphaQuality`、`method`、`lossless`、`nearLossless`、`crop`、`resize`、metadata 等。[官方仓库](https://github.com/imagemin/imagemin-webp)                           | 输出格式会变化；核心文件 API 的目标扩展名处理与 buffer API 都要有契约测试                                         |
| `imagemin-avif`     | 社区实现以 Sharp 为后端，公开为 `imageminAvif(options?)(buffer)`。[npm metadata](https://registry.npmjs.org/imagemin-avif/latest)、[官方仓库](https://github.com/delfimov/imagemin-avif)                                    | “兼容 imagemin-avif”需要先声明目标实现；它不是 imagemin 官方组织插件，不能把其全部 Sharp options 自动视为项目标准 |

### 建议的阶段顺序

如果严格按指定插件最近一年 npm 下载量推进：

1. Phase 0：核心数据模型、格式探测、插件管线、N-API 异步任务、JS 兼容 API、fixtures/test harness。
2. Phase 1：SVG / `svgo` 兼容面。
3. Phase 2：GIF / `gifsicle` 兼容面。
4. Phase 3：PNG lossy / `pngquant` 兼容面。
5. Phase 4：JPEG lossy / `mozjpeg` 兼容面。
6. Phase 5：WebP 编码。
7. Phase 6：AVIF 编码。

若目标是更完整地覆盖经典 imagemin 使用场景，则在 Phase 2 加入 `optipng`，在 Phase 4 加入 `jpegtran`。每个 codec phase 都应先完成 Rust API、错误模型、真实 fixture/golden tests，再接 N-API 和 JS 插件工厂。

## Oxc 与 Rolldown：适合本项目的仓库结构经验

### Oxc

Oxc 的 Cargo workspace 可覆盖 `apps/*`、`crates/*`、`napi/*`、`tasks/*`，而 pnpm workspace 选择 `apps/*`、`napi/*`、`wasm/*`、`npm/*` 和部分 tasks；两套 workspace 按构建系统职责独立组织：[Cargo workspace](https://github.com/oxc-project/oxc/blob/8da040290cc021376d64e5621e1da4fe214bd14f/Cargo.toml)、[pnpm workspace](https://github.com/oxc-project/oxc/blob/8da040290cc021376d64e5621e1da4fe214bd14f/pnpm-workspace.yaml)。

其结构要点：

- `crates/*` 是细粒度可组合 Rust 组件；`apps/*` 是最终应用；`napi/*` 是 Node integration layer：[架构文档](https://github.com/oxc-project/oxc/blob/8da040290cc021376d64e5621e1da4fe214bd14f/ARCHITECTURE.md)。
- parser、transform、minify 等 N-API 产品各有相邻的 Rust crate、JS 包、测试和 benchmark：[napi 目录](https://github.com/oxc-project/oxc/tree/8da040290cc021376d64e5621e1da4fe214bd14f/napi)。
- 大型 conformance、coverage、benchmark、代码生成放在 `tasks/*`，而不是塞进库 crate：[tasks](https://github.com/oxc-project/oxc/tree/8da040290cc021376d64e5621e1da4fe214bd14f/tasks)。
- 平台 npm 目录不长期提交；release workflow 汇总 artifacts 后运行 `napi create-npm-dirs` 与 `napi artifacts`：[N-API release workflow](https://github.com/oxc-project/oxc/blob/8da040290cc021376d64e5621e1da4fe214bd14f/.github/workflows/reusable_release_napi.yml)。

这适合 imagemin-rs 的“多个 codec crate、一个 Node binding、一个稳定公开包”方向。

### Rolldown

Rolldown 采用另一种同样合理的边界：Rust 核心和 N-API 胶水分别位于 `crates/rolldown`、`crates/rolldown_binding`，JS API、CLI、loader 和 Node 测试统一在 `packages/rolldown`：[repo structure](https://github.com/rolldown/rolldown/blob/b9823050bc658ef65105148ea0504d4fbda7fa4c/docs/development-guide/repo-structure.md)、[binding crate](https://github.com/rolldown/rolldown/tree/b9823050bc658ef65105148ea0504d4fbda7fa4c/crates/rolldown_binding)、[public package](https://github.com/rolldown/rolldown/tree/b9823050bc658ef65105148ea0504d4fbda7fa4c/packages/rolldown)。

其结构要点：

- `packages/*` 统一容纳正式包、browser/debug、benchmark 和测试适配器：[packages](https://github.com/rolldown/rolldown/tree/b9823050bc658ef65105148ea0504d4fbda7fa4c/packages)。
- 公开站点文档在 `docs`，实现设计在 `internal-docs`，避免所有内部计划进入用户站点：[docs](https://github.com/rolldown/rolldown/tree/b9823050bc658ef65105148ea0504d4fbda7fa4c/docs)、[internal docs](https://github.com/rolldown/rolldown/tree/b9823050bc658ef65105148ea0504d4fbda7fa4c/internal-docs)。
- 官方测试指南把 Rust 与 Node 测试分开，并大量使用目录化、数据驱动的端到端 fixtures：[testing guide](https://github.com/rolldown/rolldown/blob/b9823050bc658ef65105148ea0504d4fbda7fa4c/docs/development-guide/testing.md)。
- 发布 CI 下载多平台 artifacts 后，在包目录执行 `napi create-npm-dirs`，再发布 root 与平台包：[publish workflow](https://github.com/rolldown/rolldown/blob/b9823050bc658ef65105148ea0504d4fbda7fa4c/.github/workflows/publish-to-npm.yml)。

Rolldown 对本项目最有价值的是：binding crate 与公开 JS package 明确分离；fixtures 由端到端用例目录驱动；公开文档和内部研究/设计文档分区。

### 推荐的组合结构

以下是从上述项目推导出的候选结构，供后续原型和阶段计划采用：

```text
.
├── crates/
│   ├── imagemin-core/          # Image/format/error/codec traits
│   ├── imagemin-pipeline/      # 顺序变换、并发策略、取消
│   ├── imagemin-svg/
│   ├── imagemin-gif/
│   ├── imagemin-png/
│   ├── imagemin-jpeg/
│   ├── imagemin-webp/
│   ├── imagemin-avif/
│   └── imagemin-testing/       # fixture/golden helpers
├── napi/
│   └── imagemin/               # 薄 binding 与生成 loader 的源包
├── packages/
│   └── imagemin/               # 用户 API、plugins、types、路径/glob I/O
├── docs/                       # VitePress 用户文档
├── internal-docs/              # 研究、ADR、实现计划（站点排除）
├── fixtures/                   # 跨 crate 的真实图片与校验摘要
├── tasks/                      # Rust benchmark/conformance 工具
├── scripts/                    # JS 打包、artifact、release preflight
└── examples/                   # 可独立安装运行的 API 示例
```

codec crate 是否从第一天就逐个拆开，可以按依赖重量决定；但 `core`、`pipeline`、`napi`、公开 package 四个边界应尽早固定。

## napi-rs 当前推荐实践

### Workspace 与 binding

- napi-rs 支持 Cargo 与 JavaScript package 分置的 monorepo；用 `--cwd`、`--manifest-path`、`--package`、`--package-json-path` 明确 crate 与输出包：[Cargo and JavaScript workspaces](https://napi.rs/docs/introduction/manual-setup#cargo-and-javascript-workspaces)。
- 使用项目本地 `@napi-rs/cli`，Rust crate 设置 `cdylib`，根 `build.rs` 调用 `napi_build::setup()`：[manual setup](https://napi.rs/docs/introduction/manual-setup#configure-cargo)。
- binding 只负责 JS/Rust 类型转换、异步任务调度和错误映射；codec 算法与领域错误留在纯 Rust crate。

### Buffer 与异步选择

napi-rs 的当前决策表是：[Async and concurrency](https://napi.rs/docs/more/async-concurrency#decision-table)。

| 工作类型            | 推荐接口             |
| ------------------- | -------------------- |
| 极短同步计算        | 普通 `#[napi] fn`    |
| Rust 异步 I/O       | `#[napi] async fn`   |
| 阻塞或 CPU 密集计算 | `AsyncTask<T>`       |
| 后台线程主动调用 JS | `ThreadsafeFunction` |

图片压缩属于第三类。建议任务拥有输入 `Buffer` 和 options，在 `AsyncTask::compute` 中执行 codec 并产生 `Vec<u8>`，在 `resolve` 中转为 JS `Buffer`。同步且不跨线程时可以用 `&[u8]` 或 `BufferSlice<'env>`；跨线程或 `await` 必须使用拥有所有权的 `Buffer`：[Buffer/TypedArray types](https://napi.rs/docs/concepts/typed-array#buffer-and-typedarray-types)、[AsyncTask](https://napi.rs/docs/more/async-concurrency#asynctask-and-the-libuv-worker-pool)。

额外约束：

- 不要在 `#[napi] async fn` 的 Tokio worker 上直接做压缩；`async fn` 适合文件和网络 I/O，不会自动把 CPU 工作变成非阻塞。
- libuv worker pool 同时服务 Node 文件系统、DNS、crypto 等任务；批量图片必须限制并发。长任务或高吞吐场景应评估独立 Rust 线程池。
- `AbortSignal` 对尚未开始的 `AsyncTask` 取消最可靠；运行中的 codec 若要及时取消，需要 codec/pipeline 自己提供协作式检查。

### 错误模型

- 可恢复失败返回 `napi::Result<T>`；同步调用抛异常，异步任务拒绝 Promise：[error handling](https://napi.rs/docs/concepts/error-handling)。
- 不要把 panic 当成业务错误。
- `Error::from_reason` 只给出通用失败。公开 API 应为无效格式、不支持格式、无效 options、codec 失败、取消、I/O 失败等定义稳定 `code`，并在可行时保留底层 `cause`。
- JS 集成测试要验证 `name`、`code`、`message`、`cause`，并区分同步抛出与 Promise rejection：[error design checklist](https://napi.rs/docs/concepts/error-handling#design-checklist)。

### 构建、平台包与发布

- `--platform` 生成按 OS/CPU/libc 选择二进制的 loader；消费者不应直接加载硬编码 `.node` 文件：[configure JavaScript package](https://napi.rs/docs/introduction/manual-setup#configure-the-javascript-package)。
- 推荐发布模型是一个 root package 加多个平台 optional packages，消费者无需 Rust 工具链或安装期下载脚本：[release distribution model](https://napi.rs/docs/deep-dive/release#distribution-model)。
- `napi.targets` 只声明打包目标，不会让一次 build 编译全部目标；每个 target 都要独立 CI build 和真实运行验证。
- 当前模板推荐在发布 CI 运行 `napi create-npm-dirs`，不提交生成的 `npm/` 平台目录：[getting started](https://napi.rs/docs/introduction/getting-started#install-build-and-test)。这点应采用 Oxc/Rolldown，而不是照搬 fontmin-rs 当前树。
- 发布前执行平台目录/唯一 `.node` 校验、root/platform 精确版本校验、`npm pack --dry-run --ignore-scripts`、真实平台安装/调用 smoke test，再发布 root package：[release preflight](https://napi.rs/docs/deep-dive/release#preflight-every-version)。
- 当前跨平台建议：macOS/Windows 优先原生 runner；Linux glibc x64/arm64 用 `--use-napi-cross` 固定较低 glibc 基线；Linux musl 用 `--cross-compile` 加 Zig；不确定时复制官方 CI 矩阵：[cross-build decision matrix](https://napi.rs/docs/cross-build#decision-matrix)。

## 测试基线建议

上游结构共同指向以下测试金字塔：

1. **纯 Rust 单元测试**：options 归一化、格式探测、错误代码、元数据保留、no-op 规则。
2. **codec golden tests**：真实图片输入，校验格式、尺寸、帧数/透明度/metadata、确定性哈希（仅对确定性 codec）、大小或质量不变量；不要只断言“输出更小”。
3. **pipeline tests**：插件顺序、同步/异步插件混合、跳过不匹配格式、取消、并发上限、单项失败传播。
4. **N-API integration tests**：真实 `.node`、Buffer/Uint8Array、Promise rejection、错误 `code`/`cause`、大输入不阻塞 smoke test。
5. **imagemin compatibility tests**：`imagemin()`、`.buffer()`、glob false、无插件、destination、扩展名变化、junk 文件、第三方 JS 插件互操作。
6. **package tests**：exports/types、ESM 加载、platform loader、optionalDependencies、tarball 内容、缺失 binding 的可读错误。
7. **平台 CI**：Linux glibc/musl、macOS x64/arm64、Windows x64/arm64；支持的每个 Node 主版本至少执行加载与一项真实压缩。
8. **benchmark/回归门槛**：按 codec 分组记录吞吐、峰值内存、输出大小；性能基准不和功能测试混在一起。

napi-rs 官方也要求同时保留纯 Rust 测试和加载真实 `.node` 的 JavaScript 集成测试：[testing and debugging](https://napi.rs/docs/more/testing-debugging)。

## 仍需单独验证的事项

1. **Rust codec 选型未纳入本次范围。** mozjpeg、pngquant、GIF、WebP、AVIF 的 Rust crate/FFI 选择、许可证、静态链接、SIMD、交叉编译与最低系统版本需要独立 ADR 和原型。
2. **SVGO 兼容边界未定。** `imagemin-svgo` 的 options 直接映射 SVGO；Rust 实现是否追求插件级兼容，或只提供一组稳定优化 preset，会显著影响 Phase 1 工作量。
3. **AVIF 没有唯一官方 imagemin 目标。** 本表中的 `imagemin-avif` 是社区 Sharp wrapper。后续需决定兼容该包、只提供本项目原生 options，还是两者并存。
4. **并发模型尚需压测。** `AsyncTask` 使用共享 libuv pool；需要用多文件、大图片和 Node I/O 并发场景确定默认并发上限，以及是否引入独立 Rayon/线程池。
5. **输出确定性与元数据政策未定。** 各 codec 对时间戳、ICC/EXIF/XMP、动画 metadata 的处理不同，必须先定义默认保留/剥离策略再写 golden hashes。
6. **下载量不是需求优先级的唯一依据。** 它不能衡量现代格式战略价值；若项目目标偏现代 Web 输出，WebP/AVIF 可以在稳定版路线中提前，但这属于产品决策，不应伪装成流行度结论。
7. **公开 package 命名与兼容承诺未定。** 是否发布为 `imagemin-rs`、scoped package，是否提供 `imagemin` drop-in alias，以及最低 Node/N-API 版本，需要在原型前形成明确决策。
