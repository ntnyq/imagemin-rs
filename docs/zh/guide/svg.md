# SVG 优化

Phase 1 提供两条有意区分的 SVG 路径：`svgo()` 追求 `imagemin-svgo` 配置兼容，`svgm()` 追求受限且非阻塞的原生执行。它们不是同一个引擎的别名。

## `svgo()`：兼容优先

```ts
import imagemin, { svgo } from "imagemin-rs";

const output = await imagemin.buffer(input, {
  plugins: [
    svgo({
      multipass: false,
      plugins: [
        {
          name: "preset-default",
          params: { overrides: { removeDesc: false } },
        },
        "removeScripts",
      ],
    }),
  ],
});
```

兼容基准固定为 `imagemin-svgo@12.0.0`、`svgo@4.0.2` 和 `is-svg@6.1.0`。默认 `multipass` 为 `true`；`path`、`floatPrecision`、`plugins`、`js2svg`、`datauri` 和 custom JavaScript plugin 都原样进入 SVGO。非 SVG 输入原样返回。

完整 SVGO 在 JavaScript 主线程同步计算，Promise 只表示插件协议；处理超大 SVG 或对事件循环延迟敏感时，应评估 `svgm()`。

## `svgm()`：原生优先

```ts
import imagemin, { svgm } from "imagemin-rs";

const output = await imagemin.buffer(input, {
  plugins: [
    svgm({
      preset: "safe",
      precision: 3,
      passOverrides: {
        removeComments: false,
      },
    }),
  ],
});
```

`svgm()` 固定使用 `svgm-core@0.3.8`（附带一个仓库内维护的 path 数据解析终止性修复，防止畸形 `d` 属性挂起 worker 线程；见 [ADR 0002](https://github.com/ntnyq/imagemin-rs/blob/main/internal-docs/adr/0002-svg-engine.md)），在 napi-rs worker pool 中运行。options 是独立、封闭的原生 profile：

```ts
interface SvgmOptions {
  preset?: "safe" | "default";
  precision?: number; // 0..15
  passOverrides?: Partial<Record<SvgmPassName, boolean>>;
}
```

默认 safe preset 会保留 title、可访问描述和 viewBox。原生路径要求严格 UTF-8，并拒绝 DTD/实体声明、超过 16 MiB、超过 100,000 个节点或超过 256 层嵌套的输入。未知 option/pass 会报 `ERR_IMAGEMIN_INVALID_OPTIONS`，资源策略拒绝会报 `ERR_IMAGEMIN_INVALID_INPUT`。

## 兼容边界

| 能力                               | `svgo()` | `svgm()`             |
| ---------------------------------- | -------- | -------------------- |
| `imagemin-svgo` 默认 multipass     | 是       | 固定点收敛，不能关闭 |
| SVGO 内置插件参数、顺序和重复项    | 是       | 否                   |
| custom JavaScript plugin `fn`      | 是       | 否                   |
| `path` / `js2svg` / `datauri`      | 是       | 否                   |
| napi-rs worker pool                | 否       | 是                   |
| DTD/实体、深度、节点数和字节硬上限 | 依 SVGO  | 是                   |

两条路径都只是优化器，不是 SVG sanitizer。默认不会承诺删除脚本、事件属性、`javascript:` URL 或外部资源引用；不可信 SVG 应交给专用清洗策略。
