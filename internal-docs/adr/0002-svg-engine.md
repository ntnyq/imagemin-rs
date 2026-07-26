# ADR 0002：精确 SVGO 兼容层与受限原生 SVGM Profile

- 状态：Accepted
- 日期：2026-07-17

## 背景

`imagemin-svgo@12.0.0` 把 options 原样传给 SVGO。SVGO 4 的配置允许任意顺序、重复插件、带 `fn` 的 JavaScript 插件，以及 `path`、`js2svg` 和 `datauri`。这些语义不能可靠地序列化进 N-API，也不能由现有 Rust SVG 优化器完整复现。

候选调研见 [`docs/research/svg-codec-selection.md`](../../docs/research/svg-codec-selection.md)。调研还发现 `oxvg_optimiser@0.0.5` 虽声明 MIT，但发布源码包含明确标为 GPLv2 派生的 `precheck.rs`。在上游澄清或重写前，把它链接进 MIT 平台包存在不可接受的发布风险。

## 决策

### `svgo()` 是精确兼容路径

- 固定运行时 `svgo@4.0.2` 与输入识别器 `is-svg@6.1.0`，不使用 semver 范围。
- 工厂返回标准 `ImageminPlugin`，默认补入 `multipass: true`，其余配置原样传递。
- 非 SVG 返回原输入引用；损坏且不能被 `is-svg` 识别的 XML 同样保持上游 no-op 行为。
- 内置插件顺序、重复项、custom `fn`、preset override 及所有顶层 SVGO options 均由固定版本的 SVGO 执行。
- 该路径是 JavaScript 同步 CPU 工作包在 Promise Interface 中，可能占用 Node 主线程；文档必须明确这一点。

### `svgm()` 是显式原生路径

- Rust core 固定依赖 `svgm-core = "=0.3.8"`，只通过私有 Adapter 使用。
- 默认 `preset: "safe"`；公开 `preset`、`precision` 与布尔 `passOverrides`，不冒充 SVGO options。
- 通过 napi-rs `AsyncTask` 在 worker pool 运行，并保留相邻原生插件融合。
- 进入 SVGM 前严格 UTF-8 解码，并拒绝 DTD/ENTITY、超过 16 MiB 的输入、超过 100,000 个节点或超过 256 层嵌套的文档。
- 原生优化器不是 sanitizer；safe preset 保留脚本、事件属性和外部引用。

### 暂不自动切换引擎

`svgo()` 首版不根据 options 自动切换到 SVGM。两个引擎的 pass 集合、顺序、serializer 和 fixed-point 行为不同；当前 corpus 只能证明受测样本的渲染等价，不能证明 SVGO 默认配置的完整语义等价。未来只有在配置子集拥有独立差分 fixture、渲染门禁和结构不变量后，才允许把该子集升级为内部 native fast-path。

### 供应链门禁

`deny.toml` 明确禁止重新引入 `oxvg_ast` 和 `oxvg_optimiser`，并使用许可证白名单。CI 运行 cargo-deny 的 bans、licenses 和 sources 检查。静态工具不能替代逐文件许可证审查，但可阻止已知风险依赖被无意恢复。

## 结果

用户可以立即替换 `imagemin-svgo` 的常见与高级配置，不会遇到静默丢 option；需要原生 worker-pool 执行的用户可显式选择边界清楚的 `svgm()`。代价是 Phase 1 同时分发固定的 JS SVGO 兼容执行器与 Rust SVGM 核心，并维护两套明确区分的测试。

## 补充（2026-07-27）：vendored svgm-core 缺陷修复

`svg_pipeline` fuzz target 在 `svgm-core@0.3.8` 中先后发现两个产品级缺陷，上游截至
决策日没有更新版本：

1. `parse_path` 在参数组边界遇到既非命令字母也不能作为数字开头的字符（如
   `<path d="M0 0 e"/>`）时不消费该字符，外层循环永不推进——60 字节输入即可把
   worker 线程永久占满。
2. `minifyStyles`/`convertTransform` 用 `byte as char` 重组文本，任何非 ASCII 的
   `<style>` 内容都会被按 Latin-1 重编码：字符被写坏，且每轮 fixed-point 迭代字节数
   ×4，单次调用放大约一百万倍，再次优化输出即超时。

处置：把 crates.io 的 0.3.8 源码 vendor 进 `vendor/svgm-core`（MIT OR Apache-2.0），
最小化修改上述两处（解析失败让对应元素保持原样；文本按字节复制，纯 ASCII 输入
逐字节等价），由根 workspace 与 fuzz workspace 的 `[patch.crates-io]` 共同消费。
`M0 0 -` 这类尾部垃圾从"重写时静默丢弃"变为"整条 path 不改写"，与渲染器错误
恢复语义一致。回归测试在 `crates/imagemin-codec-svg/tests/svgm.rs`，findings log 在
`internal-docs/fuzzing.md`；来源、补丁与移除条件见 `vendor/svgm-core/VENDORED.md`。
两个缺陷与"截断输入序列化为空文档"（adapter 层已守卫）均已报告上游
（[#22](https://github.com/madebyfrmwrk/svgm/issues/22)、
[#23](https://github.com/madebyfrmwrk/svgm/issues/23)、
[#24](https://github.com/madebyfrmwrk/svgm/issues/24)）；上游发布修复并通过
conformance/benchmark 门禁后应删除 vendor 与 patch。
