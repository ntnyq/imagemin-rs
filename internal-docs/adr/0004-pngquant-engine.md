# ADR 0004：pngquant 兼容引擎与 alpha 边界

- 状态：Accepted
- 日期：2026-07-17

## 决策

`pngquant()` 固定 `imagemin-pngquant@10.0.0` 的公开 option shape，并执行项目自建的
pngquant 3.0.3 executable。pngquant tag archive 与其 libimagequant submodule commit
均由 SHA-256 固定，Cargo 依赖由独立 lockfile 固定。GPL-3.0-or-later executable 与
MIT Rust/N-API addon 之间保持进程边界，不静态或动态链接进 `.node`。

8 个 `@imagemin-rs/sidecar-pngquant-*` optional packages 按 OS/CPU/libc 分发二进制、
provenance manifest 与 pngquant/libimagequant 完整 `COPYRIGHT`。生产安装不使用
runtime download 或 install-time compile；`pngquant-bin@9.0.0` 仅保留为开发 oracle。

支持 `speed: 1..11`、`strip`、`quality: [min,max]`、`dithering: 0..1 | false`
与 `posterize`。未提供的 option 不补 flag，由 pngquant 自身使用默认值。
`quality` 乘 100 后按 JavaScript `Math.round` 取整；exit code 99 返回原输入 identity，
其他非零退出映射为 `ERR_IMAGEMIN_CODEC`。

项目不会在 Phase 3 公开 `quantette()` 原生入口，也不会用 Quantette 替代
`pngquant()`。`quantette@0.6.0` 许可宽松、量化质量良好，但不支持 alpha，MSRV 为
Rust 1.90，且没有 pngquant 的 quality floor、speed、posterize 与 alpha-aware
dithering 语义。

APNG 是保守 no-op。pngquant 3 会成功读取 APNG，却只输出 default image 并删除
`acTL`/`fcTL`/`fdAT`，因此逐字节追随上游会造成静默动画丢失。安全性优先于这一
项 bug compatibility。

## 原因

`imagequant@4.4.1`、`imagequant-sys` 和 pngquant CLI 均为
GPL-3.0-or-later；直接链接会改变 MIT addon 的分发边界。商业 libimagequant 许可
不是公开包可依赖的默认条件。进程隔离能够保留真实 libimagequant 的 RGBA、gamma
与 premultiplied-alpha 量化语义，同时使许可证边界可审计。

只量化 RGB、阈值化 alpha 或先合成单一背景都会破坏半透明边缘。透明 conformance
因此在黑、白和棋盘背景合成后比较输出，并单独约束 alpha 误差；不能由 opaque-only
量化器冒充。

## 结果

- 进程限制为 256 MiB 输入、512 MiB stdout、1 MiB stderr、120 秒 wall time，
  且在启动前拒绝超过 512 MiB 解码预算的 IHDR dimensions。
- 非 PNG 返回原输入 identity；损坏但具有 PNG signature 的数据返回 codec error。
- options 在工厂调用时同步验证，未知字段被拒绝；这比上游在插件执行时才验证并
  忽略未知字段更严格。
- pngquant 可以输出比输入更大的文件；兼容入口不擅自 keep-smaller。quality floor
  失败才按 exit 99 返回原文件。
- 8 目标构建、版本、provenance、许可证、verify/pack 与全 codec tarball smoke 已
  接入 release workflow；`v0.1.0-rc.6` 已取得全部 8 个目标的真实安装与 codec
  smoke 证据。
- npm tarball 保留 GPL notice 与对应 source availability；maintainer 法律复核仍是
  稳定版门槛。

完整证据见 [Phase 3 调研](../../docs/research/pngquant-codec-selection.md)。
