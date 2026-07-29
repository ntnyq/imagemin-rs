# PNG 有损量化

Phase 3 提供 `imagemin-pngquant@10.0.0` 兼容入口。它调用独立的 pngquant sidecar，
使用真实 libimagequant 处理 RGBA palette、半透明边缘和 quality floor。

## 使用

```ts
import imagemin, { pngquant } from "imagemin-rs";

const output = await imagemin.buffer(input, {
  plugins: [
    pngquant({
      quality: [0.6, 0.8],
      speed: 3,
      dithering: 1,
      strip: true,
    }),
  ],
});
```

```ts
interface PngquantOptions {
  speed?: number; // integer 1..11
  strip?: boolean;
  quality?: [number, number]; // each value 0..1
  dithering?: number | boolean; // 0..1 or false; true is invalid upstream
  posterize?: number;
}
```

未传 `speed` 时不添加 flag，实际默认值由固定 binary 决定。`dithering:false` 映射为
上游的 `--ordered`；数值映射为 `--floyd=<value>`。quality floor 无法满足时
pngquant 以 code 99 退出，插件返回原输入对象。

## 安全与兼容边界

pngquant 3.0.3 与固定 libimagequant source 是 GPL-3.0-or-later executable，只通过
child process 执行，不链接进 MIT native addon。输入、输出、stderr、执行时间和解码
尺寸都有硬上限。

普通 PNG 在 option matrix 中与 `imagemin-pngquant@10.0.0` 逐字节比较。项目额外
做两项更严格的处理：未知 option 在工厂调用时同步报错；APNG 原样返回，因为
pngquant 会把动画静默降级为单帧。

透明 corpus 解码输入与输出，在黑、白和棋盘背景合成后约束平均通道误差，并单独
约束 alpha 误差。只支持 RGB 的 Quantette 不会被隐藏在 `pngquant()` 名下。

## 确定性与平台版本

生产路径使用项目从固定源码和 Cargo lock 构建的 pngquant 3.0.3。8 个
`@imagemin-rs/sidecar-pngquant-*` 平台包携带 SHA-256 provenance、对应 source
references 与完整 GPL 文本，不使用运行时下载或安装期编译。
`pngquant-bin@9.0.0` 仅保留为开发差分 oracle；跨平台只在同一自建版本与配置间比较。
