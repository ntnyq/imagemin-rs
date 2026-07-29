# 1.0 公开试用

首个稳定版的目标发布日期是 **2026 年 8 月 17 日**。前提是一个完整的 35 包 RC
连续公开 14 天，并且没有 release-blocking 缺陷。

试用版本为 `0.1.0-rc.9`。全部 35 个包，包括 WASM、binding 与平台 sidecar，都已经
可以通过 npm `next` 安装。registry 闭环与 fresh install 在
**2026-07-30 06:29 +08:00** 完成，该时刻为 T0。若证据最低要求全部满足且没有 P0/P1
重置计时，最早可进入稳定版的时刻是 **2026-08-13 06:29 +08:00**。

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
素材。请通过[公开反馈台账](https://github.com/ntnyq/imagemin-rs/issues/4)提交结果。

最低证据要求为至少 3 份独立消费者报告，并覆盖两个 OS 家族；这些报告合计必须覆盖
默认无 Sharp、显式安装 `sharp@0.35.3` 后的 AVIF，以及浏览器或 Worker WASM。

## 哪些问题阻断 1.0

安全问题、数据丢失/损坏、支持平台安装失败、崩溃、错误 codec 结果、包版本不一致、
缺少许可证/源码材料或 WASM 部署损坏都会阻断稳定版。修复这些问题必须发布新 RC，并
重新开始 14 天观察。

小型文档和易用性问题仍然欢迎反馈，但通常不重置计时。当前日期和 gate 状态见
[路线图](./roadmap.md)。
