# Phase 3 pngquant benchmark

基准使用 `fixtures/png/pngquant-rgba.hex`：128×96、24,361 bytes、包含透明边缘和
大量颜色的 RGBA PNG。每个 case 预热 3 次并运行 30 次。当前开发机为 darwin arm64、
Node 24.16.0、pngquant 3.0.3。

| profile                   | output bytes |  median |     p95 |
| ------------------------- | -----------: | ------: | ------: |
| default                   |       11,835 | 25.04ms | 31.68ms |
| speed 1                   |       11,797 | 35.16ms | 51.94ms |
| speed 11 + ordered dither |       11,691 | 15.77ms | 22.28ms |

这些数值是回归基线，不是跨平台承诺。CI 在 Linux x64 / Node 24 上传同结构 JSON；
sidecar 版本不同的结果必须先按 ADR 0004 解释，不能直接归因为代码性能变化。
