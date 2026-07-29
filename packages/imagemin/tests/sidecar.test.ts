import { join, resolve } from "node:path";

import { describe, expect, test } from "vitest";

import { resolveSidecarBinary, sidecarPackageName } from "../src/sidecar";

describe("sidecar resolution", () => {
  test("maps every supported platform tuple to its package", () => {
    expect(sidecarPackageName({ arch: "arm64", platform: "darwin" })).toBe(
      "@imagemin-rs/sidecars-darwin-arm64",
    );
    expect(sidecarPackageName({ arch: "x64", platform: "win32" })).toBe(
      "@imagemin-rs/sidecars-win32-x64-msvc",
    );
    expect(sidecarPackageName({ arch: "arm64", libc: "glibc", platform: "linux" })).toBe(
      "@imagemin-rs/sidecars-linux-arm64-gnu",
    );
    expect(sidecarPackageName({ arch: "x64", libc: "musl", platform: "linux" })).toBe(
      "@imagemin-rs/sidecars-linux-x64-musl",
    );
    expect(() => sidecarPackageName({ arch: "riscv64", platform: "linux" })).toThrow(
      /Unsupported sidecar architecture/u,
    );
  });

  test("uses an explicit cwebp path when supplied", () => {
    const path = resolve("fixtures/cwebp");
    expect(resolveSidecarBinary("cwebp", { override: path })).toBe(path);
  });

  test("resolves cwebp from the current platform package", () => {
    const binary = resolveSidecarBinary("cwebp");
    expect(binary).toBe(
      join(
        workspaceRoot,
        "npm",
        `sidecars-${currentPlatformDirectory()}`,
        process.platform === "win32" ? "cwebp.exe" : "cwebp",
      ),
    );
  });
});

const workspaceRoot = resolve(import.meta.dirname, "../../..");

function currentPlatformDirectory(): string {
  if (process.platform === "darwin") return `darwin-${process.arch}`;
  if (process.platform === "win32") return `win32-${process.arch}-msvc`;
  const report = process.report?.getReport() as
    | { header?: { glibcVersionRuntime?: unknown } }
    | undefined;
  const libc = report?.header?.glibcVersionRuntime === undefined ? "musl" : "gnu";
  return `linux-${process.arch}-${libc}`;
}
