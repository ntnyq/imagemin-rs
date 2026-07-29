# Platform support

imagemin-rs publishes prebuilt packages for eight OS, architecture, and libc
targets. There is no source-build fallback during installation.

## Runtime policy

| Platform   | Architectures | Minimum runtime baseline          |
| ---------- | ------------- | --------------------------------- |
| macOS      | x64, arm64    | macOS 11.0                        |
| GNU/Linux  | x64, arm64    | Linux kernel 4.18 and glibc 2.28  |
| musl Linux | x64, arm64    | Linux kernel 3.10 and musl 1.1.19 |
| Windows    | x64           | Windows 10 or Windows Server 2016 |
| Windows    | arm64         | Windows 10                        |

These are the lower bounds for the package's minimum Node.js 22 line and its
native artifacts. The effective requirement is always the higher of this table
and the support policy of the Node.js major version being used. A later Node.js
major can raise its own operating-system minimum independently.

Node.js 22.13 or newer is required. Project CI currently tests Node.js 22, 24,
and 26 on Linux, macOS, and Windows. Other future Node.js majors are not
guaranteed until they enter that matrix.

The baselines follow the
[Node.js 22 supported-platform table](https://github.com/nodejs/node/blob/v22.x/BUILDING.md#platform-list).
musl is classified as experimental by Node.js and commonly uses the
[unofficial musl builds](https://github.com/nodejs/unofficial-builds#builds);
production users should validate their exact Alpine or other musl image.

## Build evidence

- macOS native bindings use `MACOSX_DEPLOYMENT_TARGET=11.0`; all project-built
  sidecars use the same CMake, compiler, or Rust target.
- GNU/Linux sidecars are built with Zig targets ending in `.2.28`, matching the
  glibc baseline.
- musl sidecar executables are statically linked. The native binding is
  selected through the musl-specific optional package.
- Windows executables use the MSVC runtime model; project-built sidecars use
  the static CRT.
- Tagged releases install the final tarballs and run every codec on all eight
  targets before npm staging.

The release workflow is the compatibility authority. Successfully compiling a
different local artifact does not expand the supported matrix.

## Support lifetime

An OS version is unsupported once its vendor or the selected Node.js major no
longer supports it, even if a binary still starts. Raising a baseline requires:

1. an explicit changelog entry and documentation update;
2. package and release-workflow contract changes;
3. a full eight-target release smoke;
4. a new release version—never a replacement binary under an existing version.

See [Troubleshooting](./troubleshooting.md) for native-load diagnostics.
