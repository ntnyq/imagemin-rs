# Phase 4 JPEG codec 选型调研

更新日期：2026-07-29

## 结论

Phase 4 使用受限 sidecar 实现两个兼容入口：

- `mozjpeg()` 固定 `imagemin-mozjpeg@10.0.0` 的 option shape，生产执行项目自建的
  MozJPEG 4.1.1 `cjpeg`；
- `jpegtran()` 固定 `imagemin-jpegtran@8.0.0` 的语义，生产执行同次构建产出的
  MozJPEG 4.1.1 `jpegtran`。

这不是对 Rust FFI 的永久否定，而是当前兼容与风险隔离的最优边界。C codec 崩溃、
超时与输出膨胀不会穿过 napi-rs addon。直接链接 Rust `mozjpeg`/sys crate 会扩大
unsafe、panic、NASM/SIMD、交叉编译和许可证审计面，仍不能保证与上游 npm binary
的 byte parity。

历史 `mozjpeg@8.0.0` 与 `jpegtran-bin@7.0.0` 只作开发差分 oracle。生产发布从
SHA-256 固定的 MozJPEG 4.1.1 archive 构建 8 个目标，记录 codec version、源码与
二进制 SHA-256，并随平台包分发完整许可证文本；安装时没有下载或本机编译回退。

## 固定的上游行为

### imagemin-mozjpeg 10.0.0

上游把 JPEG 输入交给 `cjpeg`，默认开启 progressive、trellis、trellis DC 与
overshoot。公开 options 包含 quality、progressive、targa、revert、fastCrush、
dcScanOpt、trellis、trellisDC、tune、overshoot、arithmetic、dct、quantBaseline、
quantTable、smooth、maxMemory 和 sample。

本地安装的 `mozjpeg@8.0.0` macOS arm64 executable 报告：

```text
mozjpeg version 3.2 (build 20180508)
```

固定 fixture 的默认、baseline/quality、高级参数和 arithmetic/revert matrix 与上游
逐字节相同。`quantBaseline:true` 是一项有意修复：上游构造
`-quant-baseline true`，cjpeg 会把 `true` 当成输入文件而失败；本项目只传
`-quant-baseline`。

MozJPEG 重编码会保留 fixture 中的 EXIF、ICC 与 comment。它仍是有损编码器，不能
只比较字节或文件大小；测试使用独立纯 JavaScript JPEG decoder 比较尺寸、灰度支持
和平均 RGB 误差。

### imagemin-jpegtran 8.0.0

上游参数固定从 `-copy none` 开始，`progressive:true` 添加 `-progressive`；
`arithmetic:true` 添加 `-arithmetic`，否则添加 `-optimize`。本项目通过 stdin/stdout
执行，替代上游临时文件；固定 matrix 证明输出逐字节一致。

本地安装的 `jpegtran-bin@7.0.0` macOS arm64 executable 报告：

```text
libjpeg-turbo version 1.5.1 (build 20161213)
```

变换保持 DCT coefficients，无论 baseline/progressive 或灰度 fixture，独立解码后的
像素完全相同。但 `-copy none` 会删除 EXIF orientation、ICC profile 与 comment。
因此“系数无损”不等于“显示语义无损”：删除 orientation 可能改变方向，删除 ICC
可能改变色彩管理结果。这项行为为兼容而保留，必须在公开文档中警告。

## 候选比较

| 方案                           | 兼容性                       | 故障隔离 | 构建/发布风险                             | 决策       |
| ------------------------------ | ---------------------------- | -------- | ----------------------------------------- | ---------- |
| 固定 cjpeg/jpegtran sidecar    | 同 binary 可逐字节对照上游   | 进程边界 | 需要自建多平台 artifact 与 provenance     | 采用       |
| Rust `mozjpeg` / `mozjpeg-sys` | API/版本不同，非 byte oracle | addon 内 | unsafe、panic、NASM/SIMD、交叉编译        | 暂不采用   |
| 纯 Rust JPEG encoder           | 高级 MozJPEG flags 不可映射  | addon 内 | 维护较简单，但无法称为上游兼容            | 可作新入口 |
| 直接依赖历史 npm 预构建包发布  | 当前机器可兼容               | 进程边界 | 架构/版本漂移、源码与 build provenance 弱 | 仅开发基线 |

## 许可证与来源

`mozjpeg` 和 `jpegtran-bin` 的 JavaScript wrapper 都声明 MIT，但这不能代替 executable
内 codec 的许可证。MozJPEG/libjpeg-turbo 组合包含 IJG、BSD-3-Clause 与 zlib-style
许可/notice；发布 artifact 必须保留上游完整文本与 attribution。它们不是 GPL，因此
不像 gifsicle/pngquant 那样需要通过进程边界规避 copyleft 链接问题；本阶段仍选择
进程边界，理由是精确兼容、崩溃隔离和可独立 fingerprint。

主要一手来源：

- [imagemin-mozjpeg](https://github.com/imagemin/imagemin-mozjpeg)
- [mozjpeg-bin](https://github.com/imagemin/mozjpeg-bin)
- [Mozilla MozJPEG](https://github.com/mozilla/mozjpeg)
- [imagemin-jpegtran](https://github.com/imagemin/imagemin-jpegtran)
- [jpegtran-bin](https://github.com/imagemin/jpegtran-bin)
- [libjpeg-turbo](https://github.com/libjpeg-turbo/libjpeg-turbo)

## 安全与资源边界

两条入口共用 child-process runner，并固定：

- 最大输入 256 MiB；
- 最大 stdout 512 MiB；
- 最大 stderr 1 MiB；
- 最大执行时间 120 秒；
- JPEG SOF dimensions 对应的 RGBA decode budget 不超过 512 MiB；
- 非 JPEG identity no-op；带 JPEG signature 的损坏输入为 codec error；
- EPIPE、timeout、signal、非零 exit 和输出超限均转换为稳定 `ImageminError`。

这些限制不是 fuzzing 的替代品。最终 release gate 仍需 libFuzzer/corpus、真实平台安装
smoke、恶意 marker/segment corpus 与 worker-pool/并发压力测试。

## 平台与可重复发布状态

历史 wrapper 的 macOS/Linux/Windows 预编译产物可能不是同一 codec revision；arm64
和 musl 缺失时还可能在安装机本地编译。即使 JavaScript 版本相同，也不能推导出
跨平台字节相同或性能可比。

已经实现：

1. 固定 MozJPEG 4.1.1 source archive 与 SHA-256；
2. CI 定义 darwin arm64/x64、linux gnu/musl arm64/x64、Windows arm64/x64 构建；
3. 禁止 runtime download 和 install-time compile fallback；
4. 每个二进制生成版本、source SHA-256 与 binary SHA-256 provenance；
5. 构建期对真实 JPEG 执行 cjpeg/jpegtran smoke，并从最终 npm tarball 运行全 codec
   smoke；
6. 平台包附带 MozJPEG 与 IJG 完整许可证文本。

macOS ARM64 已完成实际构建、动态依赖检查与 tarball 安装 smoke。其余 7 个目标仍需
取得首次 CI 实跑证据；SBOM 和完整 release rehearsal 仍属于 P3。
