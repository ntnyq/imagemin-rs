# Phase 1 SVG benchmark 方法

benchmark 的目标是同时观察兼容执行器和原生执行器，不把不同语义的结果伪装成同一算法排名。

```sh
pnpm run build
pnpm run bench:svg
```

`tasks/benchmark-svg.mjs` 固定使用三个 corpus 样本，对 `svgo@4.0.2` 默认 multipass 与 `svgm-core@0.3.8` safe preset 分别预热 20 次、测量 200 次，输出 JSON 中的环境、输入/输出大小、median 和 p95。可用 `BENCH_ITERATIONS` 增加测量次数。

解释结果时必须保留以下边界：

- `svgo()` 在 Node 主线程执行完整 SVGO 语义；
- `svgm()` 包含一次 napi-rs AsyncTask 调度成本，在 worker pool 执行不同的 safe profile；
- 两者 byte output 和 pass program 不相同，体积差不是兼容性结论；
- CI 后续应保存 Linux x64 的 JSON artifact；不同机器之间不比较绝对时间。

性能回归门禁在 corpus 与发布 runner 固定后设置。在此之前保留原始 JSON，不人为选择单次最好值。
