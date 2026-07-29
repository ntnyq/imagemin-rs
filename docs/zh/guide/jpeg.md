# JPEG 优化

Phase 4 提供两个语义不同的兼容入口：`mozjpeg()` 会重新编码并允许有损质量控制；
`jpegtran()` 只重排 JPEG coefficients，但为兼容上游会删除 marker metadata。

## MozJPEG

```ts
import imagemin, { mozjpeg } from "imagemin-rs";

const output = await imagemin.buffer(input, {
  plugins: [
    mozjpeg({
      quality: 80,
      progressive: true,
      tune: "ssim",
    }),
  ],
});
```

`mozjpeg()` 兼容 `imagemin-mozjpeg@10.0.0`，支持以下 options：

```ts
interface MozjpegOptions {
  quality?: number; // 0..100
  progressive?: boolean;
  targa?: boolean;
  revert?: boolean;
  fastCrush?: boolean;
  dcScanOpt?: number; // integer 0..2
  trellis?: boolean;
  trellisDC?: boolean;
  tune?: "psnr" | "hvs-psnr" | "ssim" | "ms-ssim";
  overshoot?: boolean;
  arithmetic?: boolean;
  dct?: "int" | "fast" | "float";
  quantBaseline?: boolean;
  quantTable?: number; // integer 0..5
  smooth?: number; // integer 1..100
  maxMemory?: number; // positive safe integer
  sample?: string[]; // for example ["2x2", "1x1", "1x1"]
}
```

默认输出 progressive JPEG。固定 fixture 上，默认和高级 option matrix 与
`imagemin-mozjpeg@10.0.0` 逐字节相同。唯一有意修复是 `quantBaseline:true`：上游
错误地额外传入字符串 `true`，导致 cjpeg 尝试打开名为 `true` 的文件；本项目发送
正确的无值 flag。

`targa` 继承上游 option，但兼容插件会先检查 JPEG signature，因此它不接受任意
TGA 输入。需要格式转换时应使用专门的转换入口。

## jpegtran

```ts
import imagemin, { jpegtran } from "imagemin-rs";

const output = await imagemin.buffer(input, {
  plugins: [jpegtran({ progressive: true })],
});
```

```ts
interface JpegtranOptions {
  progressive?: boolean;
  arithmetic?: boolean;
}
```

`jpegtran()` 与 `imagemin-jpegtran@8.0.0` 一样固定使用 `-copy none`。像素和 DCT
coefficients 保持无损，但 EXIF orientation、ICC profile 与 comment 会被删除。
因此它不等价于“保留显示语义”：依赖 orientation 的图片可能旋转，依赖 ICC 的图片
可能出现颜色差异。需要保留这些 metadata 时不要使用该兼容入口。

## 安全、确定性与发布边界

两条路径都执行受限的独立 sidecar，不链接进 MIT native addon，并设置输入、输出、
stderr、执行时间与解码尺寸上限。非 JPEG 原样返回；损坏但具有 JPEG signature 的
输入返回 codec error。

生产路径使用项目从固定源码构建的 MozJPEG 4.1.1 `cjpeg` 与 `jpegtran`。8 个
`@imagemin-rs/sidecars-*` 平台包携带各二进制的 SHA-256、来源 provenance 和完整许可
文本，不使用运行时下载或安装期编译。历史 `mozjpeg@8.0.0` 与
`jpegtran-bin@7.0.0` 仅保留为开发差分 oracle；不同 encoder 版本间不承诺 byte parity。
