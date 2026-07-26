# ADR 0008：薄 facade、稳定 core 与按格式聚合的 codec crates

- 状态：Accepted
- 日期：2026-07-17
- 修订：ADR 0001 的 Rust crate 粒度

## 背景

Phase 0 故意先用单一 `crates/imagemin` 验证 API、N-API seam 和 codec 行为，避免在领域边界
未知时创建一组浅转发 crate。到 Phase 6，单 crate 已同时直接依赖 GIF decoder/disposal、
Oxipng、SVGM/XML 和所有序列化实现；其中 GIF 文件达到 415 行。继续加入 codec 会带来：

- 任一格式依赖变化都会让整个领域 crate 失效和重编译；
- codec 测试可以无意使用 facade 内部能力，无法证明依赖方向；
- feature、许可证、资源限制和未来 FFI/link 策略没有独立所有者；
- closed descriptor registry 与开放 pipeline 混在同一 Module，扩展必须修改 core。

这些是已经出现的耦合，不再是假设性拆分。

## 决策

Rust workspace 使用以下依赖方向：

```text
imagemin-core
  asset · format · errors · NativePlugin trait · pipeline/accounting
       ▲                 ▲                 ▲
       │                 │                 │
codec-png            codec-gif         codec-svg
oxipng/optipng       lossless GIF      svgm/XML policy
       ╲                 │                 ╱
        ╲                │                ╱
                  imagemin facade
          JSON descriptor registry + re-exports
                         ▲
                         │
                   napi/imagemin
```

具体规则：

1. `imagemin-core` 不依赖任何 codec，也不知道 JSON 或 N-API。`optimize<P: NativePlugin>`
   接受开放 trait，负责严格顺序、错误短路和统计不变量。
2. codec crate 只依赖 core 与本格式实现。它拥有 options 解析、校验、资源上限、算法和
   conformance tests，不得依赖 `imagemin` facade。
3. `imagemin-codec-png` 同时拥有 Oxipng 与 OptiPNG-compatible path，因为它们共享
   Oxipng engine、PNG 上限和 transform policy；不为了文件数量拆成两个浅 crate。
4. `imagemin-codec-gif` 内部再按 analysis、encode、metadata、support 拆深 Module；最长生产
   文件从 415 行降到约 150 行，并让资源限制靠近实际执行点。
5. `imagemin` 保留 closed `NativePluginDescriptor` 和现有 re-export，作为 N-API 的稳定 facade。
   因而 Rust/N-API/TypeScript 公共调用不发生破坏性变化。
6. 内部 core/codec crates 设置 `publish = false`。当前产品发布单元是 npm package 和平台
   binding；如果未来发布 Rust SDK，必须另做版本与 semver ADR，不能意外发布内部接口。

## 测试边界

- core 使用 fake `NativePlugin` 验证开放扩展、顺序、accounting 和错误短路；
- codec tests 位于各自 crate，只通过 core trait/pipeline 测算法；
- facade tests 验证 plugin 名称、JSON options 和错误码兼容；
- N-API 与 TypeScript tests 继续验证跨语言融合和公开 API。

这种分层避免同一个行为只在 facade 集成测试中“碰巧通过”。

## 不采用的方案

### 每个 plugin 一个 crate

`oxipng` 与 `optipng` 会复制 engine glue、resource policy 和大量测试工具，形成浅 Module。crate
以独立依赖/许可证/构建边界为粒度，而不是以 npm 工厂函数数量为粒度。

### core 持有 codec enum

这样 core 每新增 codec 都必须修改并重新依赖具体实现，形成反向依赖。closed enum 只属于
facade seam；核心 pipeline 使用开放 trait。

### 动态 trait object registry

当前 N-API program 在调用前已解析成固定 descriptor vector，enum dispatch 更简单且无堆分配。
core 仍保持 generic trait，因此未来第二个 adapter 不受 closed registry 限制。

## 结果

新增原生格式时只需新增一个 codec crate，并在 facade 注册；core、既有 codec 和 N-API 类型
无需改变。依赖审计、fuzz corpus、资源上限和编译失败会定位到格式所有者，同时保留现有
`imagemin::optimize`、descriptor 与 napi-rs ABI 行为。
