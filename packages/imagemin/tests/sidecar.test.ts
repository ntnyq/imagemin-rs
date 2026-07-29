import { join, resolve } from "node:path";

import { describe, expect, test } from "vitest";

import {
  pngquantSidecarPackageName,
  resolveSidecarBinary,
  sidecarPackageName,
} from "../src/sidecar";

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

  test("maps every supported platform tuple to its pngquant package", () => {
    expect(pngquantSidecarPackageName({ arch: "arm64", platform: "darwin" })).toBe(
      "@imagemin-rs/sidecar-pngquant-darwin-arm64",
    );
    expect(pngquantSidecarPackageName({ arch: "x64", platform: "win32" })).toBe(
      "@imagemin-rs/sidecar-pngquant-win32-x64-msvc",
    );
    expect(pngquantSidecarPackageName({ arch: "arm64", libc: "glibc", platform: "linux" })).toBe(
      "@imagemin-rs/sidecar-pngquant-linux-arm64-gnu",
    );
  });

  test("uses an explicit binary path when supplied", () => {
    for (const tool of ["cjpeg", "cwebp", "jpegtran", "pngquant"] as const) {
      const path = resolve(`fixtures/${tool}`);
      expect(resolveSidecarBinary(tool, { override: path })).toBe(path);
    }
  });

  test("resolves pngquant from its GPL platform package", () => {
    expect(resolveSidecarBinary("pngquant")).toBe(
      join(
        workspaceRoot,
        "npm",
        `sidecar-pngquant-${currentPlatformDirectory()}`,
        process.platform === "win32" ? "pngquant.exe" : "pngquant",
      ),
    );
  });

  test("resolves BSD sidecars from the current platform package", () => {
    for (const tool of ["cjpeg", "cwebp", "jpegtran"] as const) {
      const binary = resolveSidecarBinary(tool);
      expect(binary).toBe(
        join(
          workspaceRoot,
          "npm",
          `sidecars-${currentPlatformDirectory()}`,
          process.platform === "win32" ? `${tool}.exe` : tool,
        ),
      );
    }
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
