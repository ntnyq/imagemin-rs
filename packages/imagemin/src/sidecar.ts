import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

type SidecarTool = "cjpeg" | "cwebp" | "jpegtran";

interface ResolveSidecarOptions {
  override?: string | undefined;
}

interface SidecarPlatform {
  arch: string;
  libc?: "glibc" | "musl" | undefined;
  platform: NodeJS.Platform;
}

const require = createRequire(import.meta.url);

export function resolveSidecarBinary(
  tool: SidecarTool,
  options: ResolveSidecarOptions = {},
): string {
  if (options.override !== undefined) return resolve(options.override);

  const packageName = sidecarPackageName();
  let manifestPath: string;
  try {
    manifestPath = require.resolve(`${packageName}/package.json`);
  } catch (cause) {
    throw new Error(
      `Missing optional package ${packageName}; reinstall imagemin-rs with optional dependencies enabled`,
      { cause },
    );
  }

  const binaryName = process.platform === "win32" ? `${tool}.exe` : tool;
  return join(dirname(manifestPath), binaryName);
}

export function sidecarPackageName(platform: SidecarPlatform = currentPlatform()): string {
  if (!["arm64", "x64"].includes(platform.arch)) {
    throw new Error(`Unsupported sidecar architecture: ${platform.arch}`);
  }
  if (platform.platform === "darwin") {
    return `@imagemin-rs/sidecars-darwin-${platform.arch}`;
  }
  if (platform.platform === "win32") {
    return `@imagemin-rs/sidecars-win32-${platform.arch}-msvc`;
  }
  if (platform.platform === "linux") {
    const libc = platform.libc ?? currentLinuxLibc();
    return `@imagemin-rs/sidecars-linux-${platform.arch}-${libc === "glibc" ? "gnu" : "musl"}`;
  }
  throw new Error(`Unsupported sidecar platform: ${platform.platform}`);
}

function currentPlatform(): SidecarPlatform {
  return {
    arch: process.arch,
    ...(process.platform === "linux" ? { libc: currentLinuxLibc() } : {}),
    platform: process.platform,
  };
}

function currentLinuxLibc(): "glibc" | "musl" {
  const report = process.report?.getReport() as
    | { header?: { glibcVersionRuntime?: unknown } }
    | undefined;
  return report?.header?.glibcVersionRuntime === undefined ? "musl" : "glibc";
}
