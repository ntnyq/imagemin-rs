# Phase 2 benchmark

`tasks/benchmark-phase2.mjs` measures the public plugin paths against the
deterministic animation and RGBA PNG fixtures. It reports median/p95 latency
and output size for:

- Gifsicle compatibility process at O3;
- native `giflossless()` worker task;
- OptiPNG-shaped level 3;
- native Oxipng level 3.

Run after building the package:

```sh
pnpm run build
pnpm run bench:phase2
```

The benchmark is diagnostic rather than a pass/fail microbenchmark. CI stores
the JSON with platform and Node version because Gifsicle executable patches and
process-spawn cost vary by platform. Regressions should be evaluated against
the same runner, fixture and iteration count.
