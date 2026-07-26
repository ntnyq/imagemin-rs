# Phase 6 AVIF benchmark

基准覆盖 128×96 RGBA PNG、带 EXIF/ICC Orientation 的 96×64 JPEG，以及 64×48
uncompressed RGB TIFF。每个 case 预热 2 次并运行 20 次。当前开发机为 darwin arm64、
Node 24.16.0、Sharp 0.35.3；数据包含每次隔离 Node worker 启动和 native addon 加载。

| profile              | input bytes | output bytes |   median |      p95 |
| -------------------- | ----------: | -----------: | -------: | -------: |
| PNG default          |      24,361 |       13,001 | 103.51ms | 121.68ms |
| PNG lossless + 4:4:4 |      24,361 |       41,688 | 115.36ms | 124.05ms |
| JPEG quality 80      |       6,094 |        4,870 |  84.88ms | 100.46ms |
| TIFF speed 8         |       9,356 |        2,532 |  66.81ms |  89.16ms |

4 个 PNG quality 80 / effort 4 作业并发时 wall time 为 125.55ms，四个输出均为
10,474 bytes，5ms interval 观测到的最大主事件循环延迟为 1.74ms。该项是环境基线，
不是跨机器 hard gate；CI 会上传同结构 JSON，并按 OS、architecture、Node、Sharp、
libvips/libheif/libaom 版本分组。不能把 codec stack 变化归因为 adapter 性能回归。

当前结果支持隔离进程不占用 libuv CPU worker、单 worker 单 Sharp 线程的策略。进程
启动占比明显；只有在真实大图 workload 证明收益后才引入有界持久 worker pool，且必须
先解决崩溃后复位、空闲回收、取消、背压和跨调用状态隔离。
