# 平台支持政策

imagemin-rs 为 8 个操作系统、架构与 libc 组合发布预编译平台包。安装过程没有源码
编译 fallback。

## Runtime 政策

| 平台       | 架构       | 最低 runtime 基线                 |
| ---------- | ---------- | --------------------------------- |
| macOS      | x64、arm64 | macOS 11.0                        |
| GNU/Linux  | x64、arm64 | Linux kernel 4.18、glibc 2.28     |
| musl Linux | x64、arm64 | Linux kernel 3.10、musl 1.1.19    |
| Windows    | x64        | Windows 10 或 Windows Server 2016 |
| Windows    | arm64      | Windows 10                        |

这些是最低 Node.js 22 版本线和项目原生 artifact 的下限。实际要求始终取本表与当前
Node.js 主版本支持政策中的较高值；后续 Node.js 主版本可以独立提高自身的最低系统版本。

项目要求 Node.js 22.13+。CI 当前在 Linux、macOS 与 Windows 上验证 Node.js 22、24、
26；未来主版本进入该矩阵前不作保证。

最低值来自
[Node.js 22 平台支持表](https://github.com/nodejs/node/blob/v22.x/BUILDING.md#platform-list)。
musl 在 Node.js 中属于 experimental，通常使用
[非官方 musl build](https://github.com/nodejs/unofficial-builds#builds)；生产环境仍应
验证实际 Alpine 或其他 musl 镜像。

## 构建证据

- macOS binding 固定 `MACOSX_DEPLOYMENT_TARGET=11.0`，所有项目自建 sidecar 使用相同
  CMake、编译器或 Rust target。
- GNU/Linux sidecar 使用以 `.2.28` 结尾的 Zig target，对应 glibc 基线。
- musl sidecar executable 静态链接；native binding 通过 musl 专用 optional package
  选择。
- Windows executable 使用 MSVC runtime，项目自建 sidecar 使用静态 CRT。
- npm 发布前，release workflow 会从最终 tarball 在全部 8 个目标安装并运行每个 codec。

release workflow 是兼容性依据。在其他本地环境成功编译不会自动扩大支持矩阵。

## 支持周期

当操作系统厂商或所选 Node.js 主版本停止支持某个系统版本时，即使 binary 仍能启动，
该版本也不再受支持。提高基线必须：

1. 明确更新 changelog 和文档；
2. 更新 package 与 release workflow contract；
3. 重新通过完整 8 目标 release smoke；
4. 发布新版本，不能替换已有版本下的 binary。

原生加载诊断见[安装与运行排错](./troubleshooting.md)。
