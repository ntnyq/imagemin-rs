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

`pngquant-bin@9.0.0` / pngquant 是 GPL-3.0-or-later executable，只通过 child
process 执行，不链接进 MIT native addon。输入、输出、stderr、执行时间和解码尺寸
都有硬上限。

普通 PNG 在 option matrix 中与 `imagemin-pngquant@10.0.0` 逐字节比较。项目额外
做两项更严格的处理：未知 option 在工厂调用时同步报错；APNG 原样返回，因为
pngquant 会把动画静默降级为单帧。

透明 corpus 解码输入与输出，在黑、白和棋盘背景合成后约束平均通道误差，并单独
约束 alpha 误差。只支持 RGB 的 Quantette 不会被隐藏在 `pngquant()` 名下。

## 确定性与平台版本

同一 pngquant/libimagequant build 对固定输入和参数是稳定的，但
`pngquant-bin@9.0.0` 历史预构建产物存在平台版本漂移。当前开发基线是 3.0.3；
跨平台发布在统一 sidecar build 与版本 fingerprint 门禁完成前不承诺 byte parity。
