# Native Distribution License Release Sign-off

- 决策日期：2026-07-30
- 适用范围：首个稳定版及此前最后一个完整 RC
- 当前状态：**MAINTAINER DECISION COMPLETE — RC 技术 bundle 已验证，registry 证据待完成**
- 事实底稿：[`docs/research/native-distribution-license-model.md`](../docs/research/native-distribution-license-model.md)

> 本文记录维护者选择的保守分发模型，不构成法律意见。仓库自动化只能证明制品、
> 来源、链接和交付事实。外部法律复核仍然建议进行；只要 1.0 保持 L2、GPL 随包源码
> 且没有例外，它不再作为独立工程 gate。若恢复默认 Sharp、移除随包源码或改变进程/
> 包边界，许可证 HOLD 自动重新打开。

## 已确认的工程事实

1. `imagemin-rs` 通过独立 npm 平台包分发 Gifsicle 和 pngquant executable，并以
   stdin/stdout 子进程调用；这些 executable 不链接进 MIT N-API addon。
2. Gifsicle 1.96 是 `GPL-2.0-only`。pngquant 3.0.3 和固定的 libimagequant 提交是
   `GPL-3.0-or-later`；仓库没有三者的商业许可。
3. 当前公开版本没有完成同版本闭环：`rc.6` 有 GPL sidecar 二进制、但 GitHub Release
   没有对应源码资产；`rc.7` 有源码资产、但 npm 没有同版本 GPL sidecar。
4. pngquant 的构建会静态链接 Cargo 依赖；仅保存上游 pngquant、libimagequant 归档和
   `Cargo.lock`，尚未由公开 RC 证明完整覆盖 GPLv3 Corresponding Source。当前 lockfile
   含 45 个 crates.io 源码归档；`fetch-pngquant-cargo-sources.mjs` 已能逐一下载并按
   Cargo checksum 验证全部 45 个归档，不依赖主观排除 target-specific 项。
5. 当前工作树已按 L2 把 `sharp@0.35.3` 从普通 runtime dependency 改为精确、可选的
   peer；其平台运行时包含 sharp-libvips 1.3.2，只有使用者显式安装 AVIF runtime
   时才进入应用闭包。
6. 上游 `@img/sharp-libvips-*` tarball 只有许可证摘要和链接，没有附带 GNU GPLv3、
   LGPLv3 与 AOM Patent License 1.0 全文。
7. `v0.1.0-rc.9` 已把 libaom 3.14.1 的 BSD 许可、AOM Patent License 1.0 和
   sharp-libvips 第三方清单纳入 `imagemin-rs` tarball contract，并由 pack verifier
   与 Release smoke 核对固定摘要。
8. `v0.1.0-rc.9` 的每个 GPL 平台 tarball 包含对应上游源码、项目构建材料；pngquant
   额外包含 lockfile 中全部 45 个 registry 源码归档。manifest、pack verifier 与
   八平台 Release smoke 已逐文件核对摘要；npm registry 回读仍待 35 包正式发布。
9. 当前 `@imagemin-rs/wasm` 不包含或依赖 Gifsicle、pngquant、Sharp、libvips、libaom，
   因此不在本次原生许可证 HOLD 的制品范围内。

## 推荐交付模型

以下选择优先降低接收者取得源码、许可文本和重链接材料时的歧义。若签署人选择不同
模型，必须在“例外与理由”中写明许可证条款、责任主体和等价验证方法。

### GPL sidecar

推荐选择 **随每个 GPL npm 平台包交付完整对应源码**：

- Gifsicle 使用 GPLv2 §3(a)，不依赖 npm 与 GitHub 是否属于“同一指定地点”的解释；
- pngquant/libimagequant 在同一 npm tarball 同时传输 object code 与 Corresponding
  Source，不依赖跨服务器 §6(d)；该网络交付在 GPLv3 §6 下的具体法律归类仍由法律
  复核人确认；
- tarball 必须包含精确上游源码、项目构建/安装脚本、所有实际静态链接依赖源码、
  target 配置、补丁和重建说明；
- 每个 source-to-binary manifest 必须记录源码摘要、最终 executable 摘要和构建输入；
- npm 包、Git tag 与 GitHub Release 仍须保持同版本，Release 源码资产作为额外备份，
  不能代替 tarball 内的源码。

若包体积或 registry 限制使随包源码不可接受，备选模型是：

- Gifsicle：由法律复核人明确选择并解释 GPLv2 §3 的网络交付路径或 §3(b) 书面 offer；
- pngquant/libimagequant：选择 GPLv3 §6(d)，在 object code 旁给出免费、清楚、精确、
  同版本的 Corresponding Source 指引；
- 发布主体负责不可变存储、备份、可用性监控、恢复演练和所选条款要求的期限。

无论选择哪一种模型，下一个 RC 都必须同时发布全部 GPL sidecar 与完整对应源码。
`rc.6`/`rc.7` 不能被当作合格闭环，也不能复用或覆盖版本号。

### Sharp / LGPL

必须从下面两条产品路径中具名选择一条：

#### 路径 L1：首个稳定版继续默认安装 Sharp

- 法律复核人确认 `imagemin-rs` 在 npm 安装、镜像、缓存和 bundle 场景中的
  conveyor/distributor 角色；
- 对八个平台逐项选择 LGPLv3 §4(d)(0) 或 §4(d)(1)；
- §4(d)(0) 路径交付 Minimal Corresponding Source、Corresponding Application Code、
  exact build inputs 与可执行的重链接说明；
- §4(d)(1) 路径以实际测试证明用户能替换每个相关 LGPL 组件并让修改版正常工作；
- 最终随附材料包含显著 notice、GNU GPLv3 与 LGPLv3 全文；
- 新 RC 从公开 tarball 完成八平台安装、替换或重链接验证。

#### 路径 L2：首个稳定版不默认分发 Sharp

- 把 Sharp/AVIF 从默认安装闭包移出，改为明确的可选 peer 或独立 adapter；
- 没有安装 Sharp 时，AVIF API 必须给出稳定、可操作的缺依赖错误；
- 兼容性矩阵、迁移文档和 1.0 范围明确说明 AVIF 的可选状态；
- 使用者显式安装 Sharp 后的 notice、来源和许可证指引仍须保留；
- 若未来重新默认安装或重新分发 Sharp 平台包，必须重新打开 LGPL/AOM 审计。

推荐 **L2** 作为首个稳定版路径。它避免在未证明八平台 LGPL 替换/重链接能力前，默认
把 Sharp 平台运行时带入每次安装；代价是 AVIF 从开箱即用能力变为显式 opt-in。

### AOM Patent License

若选择 L1，或项目以其他方式分发 libaom Implementation，发布主体必须：

- 在随附 documentation/legal notices 中完整重现 AOM Patent License 1.0；
- 确认并接受 §1.2.1 的 Necessary Claims reciprocity；
- 确认并接受 §1.3 的 defensive-termination 条件；
- 记录接受主体是发布个人还是法律实体，以及 affiliates 的适用处理；
- 让 tarball verifier 校验经审核文本的固定 SHA-256，而不只检查文件存在。

若选择 L2，工作树中新增的 AOM 文本仍可保留为显式安装 Sharp 时的 notice，但不得把
“附带文本”表述为发布主体已取得或转授任何专利权。

## 必填决策

| ID     | 决策                                           | 选择/结论                                                                  | 责任人                | 签署日期   |
| ------ | ---------------------------------------------- | -------------------------------------------------------------------------- | --------------------- | ---------- |
| GPL-1  | Gifsicle 交付模型：随包源码 / GPLv2 其他路径   | **随每个平台包交付源码与构建材料**                                         | repository maintainer | 2026-07-30 |
| GPL-2  | pngquant/libimagequant：随包源码 / GPLv3 §6(d) | **随每个平台包交付源码、45 个 Cargo registry 归档与构建材料**              | repository maintainer | 2026-07-30 |
| GPL-3  | 八平台 Corresponding Source 清单及排除项       | **不作 System Library 主观排除；固定 lockfile registry 源码全部纳入**      | repository maintainer | 2026-07-30 |
| GPL-4  | 独立进程与 optional package 的 aggregate 定性  | **保持独立进程/独立包；无论法律定性如何均采用更保守的随包源码交付**        | repository maintainer | 2026-07-30 |
| LGPL-1 | 选择 L1 或 L2                                  | **L2**                                                                     | repository maintainer | 2026-07-30 |
| LGPL-2 | 若选 L1：八平台分别采用 §4(d)(0) 或 §4(d)(1)   | **不适用**                                                                 | repository maintainer | 2026-07-30 |
| AOM-1  | AOM 许可文本交付位置与摘要校验                 | **默认不分发；在根包保留 opt-in Sharp 指引、AOM 全文和固定摘要校验**       | repository maintainer | 2026-07-30 |
| AOM-2  | reciprocity 与 defensive termination 接受主体  | **默认闭包不含 libaom；显式 Sharp 安装者直接接受上游条款，项目不转授权利** | repository maintainer | 2026-07-30 |
| OPS-1  | 源码资产保留、备份、监控与恢复责任             | **npm tarball 为主交付；immutable tag/Release 为备份，维护者负责恢复**     | repository maintainer | 2026-07-30 |

## 例外与理由

如未采用推荐模型，在此记录：

- 偏离项：
- 依据的许可证条款：
- 法律复核结论：
- 风险接受主体：
- 补偿控制：
- 复核日期：

## 技术验证记录

具名签署只关闭法律/产品选择，以下证据仍必须由同一个新 RC 产生：

- [ ] 全部 35 个 npm 包同版本公开，且 root optional dependency closure 可安装；
- [ ] Git tag、GitHub Release、npm tarball 和 dist-tag 指向同一不可变版本；
- [x] GPL source-to-binary manifest 覆盖八平台及所有实际静态链接依赖；
- [ ] `fetch-pngquant-cargo-sources.mjs` 取得的全部 lockfile registry 源码随所选交付
      模型发布，并由最终 tarball/release verifier 重新核对；
- [x] 最终 tarball 内的许可文本与固定官方摘要一致；
- [x] 八平台全新安装和全部 codec smoke 通过；
- [ ] 若选 L1，八平台 LGPL 替换或重链接证据通过；
- [x] 若选 L2，无 Sharp 安装与显式 Sharp 安装两种路径均在八平台通过；
- [ ] 发布资产备份、可用性监控与一次恢复演练完成；
- [ ] 审计人从公开 registry 重新下载并核对版本、摘要、notice 和源码入口。

验证版本：**`0.1.0-rc.9`**

验证 workflow：**[`v0.1.0-rc.9` Release workflow](https://github.com/ntnyq/imagemin-rs/actions/runs/30487591906)**

验证负责人：**repository maintainer**

## 最终批准

| 角色       | 姓名/法律实体         | 结论                | 签名或可审计批准链接              | 日期       |
| ---------- | --------------------- | ------------------- | --------------------------------- | ---------- |
| 发布负责人 | repository maintainer | approve（模型选择） | 2026-07-30 Codex task instruction | 2026-07-30 |
| 项目维护者 | repository maintainer | approve（模型选择） | 2026-07-30 Codex task instruction | 2026-07-30 |
| 法律复核人 | 未取得外部法律意见    | not reviewed        | 不作法律合规声明                  | 2026-07-30 |

维护者选择项已经关闭原来的“交付模型未决”HOLD。只有同一个完整 RC 的技术验证全部
勾选、没有未记录例外，才能把发行状态改为 PASS。CI 绿灯证明实现与制品事实，不应被
表述为法律意见。
