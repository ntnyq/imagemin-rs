# Phase 4 JPEG benchmark

基准使用 `fixtures/jpeg/color-metadata.hex`：96×64、6,094 bytes、包含 EXIF
orientation、ICC marker 和 comment 的 baseline 4:2:0 JPEG。每个 case 预热 3 次并
运行 30 次。当前开发机为 darwin arm64、Node 24.16.0、MozJPEG 3.2
（build 20180508）与 libjpeg-turbo 1.5.1（build 20161213）。

| profile                       | output bytes |  median |     p95 |
| ----------------------------- | -----------: | ------: | ------: |
| mozjpeg default               |        3,168 | 34.12ms | 84.49ms |
| mozjpeg quality 80 + baseline |        4,027 | 31.97ms | 37.71ms |
| jpegtran optimize             |        5,900 | 30.67ms | 35.57ms |
| jpegtran progressive          |        5,989 | 31.12ms | 34.68ms |

这些数字包含每次启动独立 sidecar 的固定开销，是安全隔离与兼容性的现实成本。结果只
作为当前 artifact 的回归基线，不是跨平台吞吐或逐字节承诺。CI 在 Linux x64 / Node
24 上传同结构 JSON；比较结果前必须先核对 codec version fingerprint。
