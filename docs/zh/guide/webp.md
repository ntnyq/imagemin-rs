# WebP 转码

Phase 5 的 `webp()` 兼容 `imagemin-webp@8.0.0`，把 PNG、JPEG、TIFF 或静态 WebP
交给固定 cwebp sidecar。它会改变格式；文件 API 根据最终内容把 destination 扩展名
改为 `.webp`。

## 使用

```ts
import imagemin, { webp } from "imagemin-rs";

const output = await imagemin.buffer(input, {
  plugins: [
    webp({
      quality: 80,
      alphaQuality: 90,
      method: 6,
    }),
  ],
});
```

```ts
interface WebpOptions {
  preset?: "default" | "photo" | "picture" | "drawing" | "icon" | "text";
  quality?: number; // 0..100
  alphaQuality?: number; // 0..100
  method?: number; // integer 0..6
  size?: number; // target bytes
  sns?: number; // 0..100
  filter?: number; // 0..100
  autoFilter?: boolean;
  sharpness?: number; // integer 0..7
  lossless?: boolean | number; // preset level 0..9 when numeric
  nearLossless?: number; // 0..100
  crop?: { x: number; y: number; width: number; height: number };
  resize?: { width: number; height: number }; // one dimension may be 0
  metadata?: "all" | "none" | "exif" | "icc" | "xmp" | WebpMetadata[];
}
```

crop 在 resize 前发生。metadata 数组可组合 `exif`、`icc` 与 `xmp`；`all`、`none`
必须单独使用。未知字段和越界值会在插件工厂调用时同步报错。

## 与上游的有意差异

上游使用 truthy 判断构造参数，因此多个合法零值会被静默忽略。本项目把
`quality:0`、`method:0`、`alphaQuality:0`、`sns:0`、`filter:0`、`sharpness:0`、
`lossless:0` 和 `nearLossless:0` 正确传给 cwebp。其他已声明 option matrix 在同一
binary 上与 `imagemin-webp@8.0.0` 逐字节一致。

APNG、animated WebP 与 multi-page TIFF 原样返回。cwebp 兼容路径不能完整转换这些
多帧/多页输入；安全 no-op 避免静默只保留首帧或首页面。GIF 也不是 cwebp 的可读
输入，需要动画 WebP 时应使用未来的专用 animation adapter。

## Lossless、透明度与 metadata

lossless WebP 保持 alpha 和所有可见像素。alpha=0 像素的 RGB 完全不可见，libwebp
可能把这部分隐藏颜色规范化；测试因此在非全透明像素检查精确 RGBA，并在黑、白背景
合成后评估 lossy 误差。

默认 metadata 策略是 `none`。`metadata:["icc","exif"]` 会生成 RIFF `ICCP` 与
`EXIF` chunks。转码本身不会自动复制源扩展名；文件 API 会使用 `.webp`。

## 发布边界

生产路径使用项目自建的 cwebp/libwebp 1.6.0，静态包含固定版本的 zlib、libpng、
libjpeg-turbo 与 libtiff。8 个 `@imagemin-rs/sidecars-*` optional packages 各自携带
源码摘要、二进制 SHA-256 和完整许可证文本；安装时不联网，也没有本机编译 fallback。

`v0.1.0-rc.6` 已在全部 8 个目标完成真实构建、PNG/JPEG/TIFF 转码和 tarball 安装
smoke。跨平台 byte parity 只对同一次发布的固定 artifact 承诺。
`cwebp-bin@8.0.0` 仅保留为开发差分 oracle。
