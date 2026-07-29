# 1.0 公开试用

首个稳定版的目标发布日期是 **2026 年 8 月 17 日**。前提是一个完整的 35 包 RC
连续公开 14 天，并且没有 release-blocking 缺陷。

计划试用版本为 `0.1.0-rc.8`。只有该精确版本的根包、WASM 包、binding 和全部平台
sidecar 都能通过 npm `next` tag 安装后，试用计时才开始。

## 参与试用

在真实 Node 项目中安装：

```sh
pnpm add imagemin-rs@next
```

运行应用实际使用的 codec。默认安装有意不包含 Sharp；需要 AVIF 时，请显式测试第二条
路径：

```sh
pnpm add sharp@0.35.3
```

Browser 或 Worker 用户可以测试：

```sh
pnpm add @imagemin-rs/wasm@next
```

反馈请包含 package manager 及版本、Node/browser 版本、OS/架构、安装命令、测试过的
codec，以及是否安装 Sharp。不要上传私有图片；请使用最小合成 fixture 或允许再分发的
素材。

## 哪些问题阻断 1.0

安全问题、数据丢失/损坏、支持平台安装失败、崩溃、错误 codec 结果、包版本不一致、
缺少许可证/源码材料或 WASM 部署损坏都会阻断稳定版。修复这些问题必须发布新 RC，并
重新开始 14 天观察。

小型文档和易用性问题仍然欢迎反馈，但通常不重置计时。当前日期和 gate 状态见
[路线图](./roadmap.md)。
