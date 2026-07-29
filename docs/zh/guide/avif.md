# AVIF 转码

Phase 6 的 `avif()` 以 `imagemin-avif@0.1.6` 的公开调用形状和默认值为兼容目标，
使用固定 `sharp@0.35.3` / libvips / libheif / libaom runtime。Sharp 只在独立 Node
子进程中加载，不会把 native addon 或其 codec 版本装入调用者进程。

## 使用

```ts
import imagemin, { avif } from "imagemin-rs";

const output = await imagemin.buffer(input, {
  plugins: [
    avif({
      quality: 80,
      effort: 6,
      chromaSubsampling: "4:4:4",
    }),
  ],
});
```

```ts
interface AvifOptions {
  quality?: number; // integer 1..100，默认 90
  lossless?: boolean; // 默认 false
  effort?: number; // integer 0..9，0 最快
  speed?: number; // integer 0..8，8 最快
  chromaSubsampling?: "4:2:0" | "4:4:4"; // 默认 4:2:0
  bitdepth?: 8; // 当前预构建 runtime 只支持 8-bit
}
```

`speed` 是社区包已经声明但没有真正传给 Sharp 的兼容字段。本项目按
`round((8 - speed) * 9 / 8)` 映射，让 speed 0/8 精确对应 effort 9/0。也可以直接使用
Sharp 语义更清晰的 `effort`；两者不能同时出现。
默认不显式传 effort，因此保持 Sharp 默认 effort 4。

Sharp 0.35 的 `auto` tuning 已改为新的 IQ 路径；兼容 adapter 内部固定 `tune:"ssim"`
以保持更接近历史 Sharp/libheif 的 quality 语义。该内部参数不扩张公开 options。

## 输入与多帧政策

静态 PNG、JPEG、GIF、WebP、TIFF 与 AVIF 可转换。SVG 和未知格式保持 identity no-op。
文件 API 根据最终 magic 把成功转码的 destination 扩展名改为 `.avif`。

APNG、animated GIF、animated WebP、带 `avis` sequence brand 的 animated AVIF，以及
multi-page TIFF 都原样返回。Sharp 的 AVIF sequence 输出当前不受支持；只编码首帧或
首页会造成不可逆内容丢失，因此不把上游的静态化行为当作兼容目标。

默认剥离 EXIF、ICC 和其他源 metadata。带 EXIF Orientation 的 JPEG 会先应用显示
方向再编码；旧版上游 runtime 会剥离 Orientation 却不旋转像素，这是本项目有意修复
的显示错误。

## 与社区包的有意差异

| 行为        | `imagemin-avif@0.1.6`                          | `imagemin-rs`                               |
| ----------- | ---------------------------------------------- | ------------------------------------------- |
| encoder     | 依赖范围解析到 Sharp 0.33.x                    | 固定 Sharp 0.35.3，语义兼容而非 byte parity |
| `speed`     | 被 Sharp 当作未知字段忽略                      | 比例映射到完整 effort 9..0                  |
| 默认对象    | `Object.assign` 修改模块全局默认值             | 每个插件实例独立快照                        |
| codec error | 引用不存在的 `callback`，变成 `ReferenceError` | 稳定 `ERR_IMAGEMIN_CODEC`                   |
| options     | 未知字段通常被忽略                             | 未知、冲突和越界字段同步拒绝                |
| Orientation | 可能剥离标签但不旋转旧版像素                   | 保持正确显示方向                            |
| animation   | 可能只取首帧/首页                              | 多帧/多页 identity no-op                    |

AVIF output 会随 Sharp、libheif 和 libaom 版本改变；不同 codec stack 不承诺逐字节一致。
测试比较独立解码后的尺寸、alpha、可见 lossless RGBA 和黑/白背景合成误差。

## 隔离与资源上限

每次编码启动一个受限 Node worker，并设置 `sharp.cache(false)`、
`sharp.concurrency(1)`。这避免 Sharp 0.33 oracle 与当前 Sharp 的原生库在同一进程重复
加载，也避免 AV1 内部线程与多文件并发形成无界过度订阅。

- input：256 MiB；output：512 MiB；stderr：1 MiB；
- 输入单边：16,384；像素：67,108,864；metadata 单 chunk 8 MiB、合计 16 MiB；
- JS old-space：768 MiB；Sharp soft timeout 180 秒、父进程 hard timeout 190 秒。

这些限制不能替代操作系统级内存沙箱，但把已知的输入、像素、输出、日志、线程和
执行时间放在确定边界内。公开 `AbortSignal` 仍属于 release-engineering 阶段。

## 8-bit 边界与发布说明

Sharp 0.35.3 的预构建 AVIF runtime 只接受 8-bit output；`bitdepth:10` 或 `12` 会在
插件工厂同步报错。项目不会把 8-bit 路径误称为 10/12-bit 支持。高 bit depth 必须在
可重复的 libheif/libaom 平台构建、独立解码 corpus 和 HDR/color-management 契约完成
后另行增加。

现代 Sharp 通过平台 optional packages 提供预构建 libvips stack，不要求最终用户
本机编译。release smoke 已接入逐平台 AVIF 实跑、`sharp.versions` 内嵌库清单及原生
文件 SHA-256；`v0.1.0-rc.6` 已完成全部 8 个目标的实跑验证。稳定版仍需完成
Sharp 内嵌原生依赖的发布日漏洞审计；完整选择依据见 Phase 6 codec ADR 和调研文档。
