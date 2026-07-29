# Troubleshooting

imagemin-rs ships prebuilt native bindings and codec executables through npm
optional dependencies. It does not download binaries or compile native code
during installation.

## Supported runtime targets

The release matrix currently covers:

- macOS x64 and arm64;
- Linux x64 and arm64 with glibc;
- Linux x64 and arm64 with musl;
- Windows x64 and arm64.

Node.js 22.13 or newer is required. CI exercises Node.js 22, 24, and 26 on
Linux, macOS, and Windows. Exact minimum OS, kernel, and libc versions are
listed in [Platform support](./platform-support.md).

## `ERR_IMAGEMIN_NATIVE_LOAD`

This code means that the platform binding could not be loaded. Check:

1. optional dependencies were not disabled with package-manager or deployment
   flags;
2. the lockfile was generated for, or allows installation on, the deployment
   platform;
3. a bundler or serverless packager did not omit native `.node` files;
4. `process.platform` and `process.arch` match a supported target;
5. Linux uses either a supported glibc or musl target.

Print the basic runtime information from the failing environment:

```sh
node -e 'console.log({ arch: process.arch, node: process.version, platform: process.platform, report: process.report?.getReport().header })'
```

Reproduce the problem in a fresh directory with only
`pnpm add imagemin-rs@next`. If that succeeds, compare the fresh installation
with the application's dependency pruning and bundling configuration.

## A codec sidecar cannot start

`gifsicle()`, `pngquant()`, `mozjpeg()`, `jpegtran()`, and `webp()` use
platform-specific executable packages. Confirm that production pruning kept
the matching packages:

```sh
pnpm why @imagemin-rs/sidecars-linux-x64-gnu
pnpm why @imagemin-rs/sidecar-pngquant-linux-x64-gnu
pnpm why @imagemin-rs/sidecar-gifsicle-linux-x64-gnu
```

Replace the suffix for the target platform. Containers must install
dependencies inside an image for the same OS, architecture, and libc used at
runtime. Copying `node_modules` across those boundaries is unsupported.

AVIF is opt-in and uses Sharp in a separate Node process. Install the exact
supported peer with `pnpm add sharp@0.35.3`. Without it, convertible inputs
reject with `ERR_IMAGEMIN_CODEC` and `plugin: "avif"`; other plugins continue
to work. Deployment bundlers for AVIF must retain Sharp's optional platform
packages and embedded shared libraries.

## Stable error codes

| Code                           | Meaning                                          |
| ------------------------------ | ------------------------------------------------ |
| `ERR_IMAGEMIN_INVALID_INPUT`   | Invalid, oversized, or structurally unsafe input |
| `ERR_IMAGEMIN_INVALID_OPTIONS` | Unknown, conflicting, or out-of-range options    |
| `ERR_IMAGEMIN_NATIVE_LOAD`     | Native binding unavailable or unloadable         |
| `ERR_IMAGEMIN_CODEC`           | Built-in codec or sidecar failed                 |
| `ERR_IMAGEMIN_PLUGIN`          | Third-party plugin threw or rejected             |
| `ERR_IMAGEMIN_PLUGIN_OUTPUT`   | Plugin returned an unsupported value             |
| `ERR_IMAGEMIN_IO`              | Source or destination filesystem failure         |
| `ERR_IMAGEMIN_ABORTED`         | Operation was cancelled                          |

Batch errors include `sourcePath` when a specific file failed. Codec and plugin
errors include `plugin` where available.

## Cancellation and partial output

Aborting stops new batch work and terminates built-in sidecars. A native task or
third-party plugin that does not cooperate with the signal can continue using
CPU after the public Promise rejects.

File batches are not transactional. Files written before an abort or later
failure remain in the destination and must be cleaned up by the caller when
all-or-nothing behavior is required.

## Browser Playground output differs

Direct, unscaled PNG output uses `@imagemin-rs/wasm` and the shared Rust
Oxipng codec. Resized PNG, JPEG, and WebP output passes through the browser
Canvas path, so those bytes can vary across browsers and do not provide the
same codec options, metadata policy, or animation support as the Node API.

If the WASM asset fails to load, confirm it is deployed next to the generated
JavaScript chunks and served with `application/wasm`. See the
[Browser WASM API](/api/wasm) for explicit initialization options.

If a clean supported-platform installation still fails, open a GitHub issue
with the error code, runtime report, package manager and version, lockfile
format, and a minimal reproduction.
