# Phase 5 WebP benchmark

基准覆盖 128×96 RGBA PNG、带 EXIF/ICC 的 96×64 JPEG，以及 64×48 uncompressed RGB
TIFF。每个 case 预热 3 次并运行 30 次。当前开发机为 darwin arm64、Node 24.16.0；
cwebp 1.2.1 artifact 为 x86_64，通过 Rosetta 执行。

| profile                    | input bytes | output bytes |  median |      p95 |
| -------------------------- | ----------: | -----------: | ------: | -------: |
| PNG default                |      24,361 |        7,544 | 35.34ms |  47.39ms |
| PNG lossless               |      24,361 |       15,790 | 72.19ms | 140.00ms |
| JPEG quality 80 + metadata |       6,094 |        4,060 | 38.07ms |  72.43ms |
| TIFF crop + resize         |       9,356 |          250 | 31.09ms |  46.30ms |

数据包含每次 sidecar 启动以及 Rosetta 成本，只是回归基线。CI 在 Linux x64 / Node 24
上传同结构 JSON；不同架构或 libwebp version 的结果必须先按 ADR 0006 分组，不能直接
归因为代码性能变化。
