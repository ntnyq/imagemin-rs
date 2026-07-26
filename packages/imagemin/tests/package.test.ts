import { readFile } from "node:fs/promises";

import { describe, expect, test } from "vitest";

interface PackageManifest {
  cpu?: string[];
  engines?: Record<string, string>;
  exports: Record<string, unknown>;
  files: string[];
  libc?: string[];
  main?: string;
  name: string;
  optionalDependencies: Record<string, string>;
  os?: string[];
  sideEffects: boolean;
  type: string;
  version: string;
}

const packageJsonUrl = new URL("../package.json", import.meta.url);
const workspaceRootUrl = new URL("../../../", import.meta.url);
const platforms = [
  { cpu: "arm64", directory: "darwin-arm64", os: "darwin" },
  { cpu: "x64", directory: "darwin-x64", os: "darwin" },
  { cpu: "arm64", directory: "linux-arm64-gnu", libc: "glibc", os: "linux" },
  { cpu: "arm64", directory: "linux-arm64-musl", libc: "musl", os: "linux" },
  { cpu: "x64", directory: "linux-x64-gnu", libc: "glibc", os: "linux" },
  { cpu: "x64", directory: "linux-x64-musl", libc: "musl", os: "linux" },
  { cpu: "arm64", directory: "win32-arm64-msvc", os: "win32" },
  { cpu: "x64", directory: "win32-x64-msvc", os: "win32" },
] as const;

describe("package contract", () => {
  test("publishes a side-effect-free ESM entry and its types", async () => {
    const manifest = await readManifest();

    expect(manifest.type).toBe("module");
    expect(manifest.sideEffects).toBe(false);
    expect(manifest.files).toEqual(["dist", "LICENSE", "README.md", "THIRD_PARTY_NOTICES.md"]);
    expect(manifest.exports).toMatchObject({
      ".": {
        default: "./dist/index.mjs",
        types: "./dist/index.d.mts",
      },
      "./package.json": "./package.json",
    });
  });

  test("keeps the native loader optional at the public package boundary", async () => {
    const manifest = await readManifest();

    expect(manifest.optionalDependencies).toEqual({
      "@imagemin-rs/binding": "workspace:*",
    });
  });

  test("keeps the loader and all platform package manifests release-consistent", async () => {
    const publicManifest = await readManifest();
    const bindingManifest = await readJson(new URL("napi/imagemin/package.json", workspaceRootUrl));
    const expectedOptionalDependencies = Object.fromEntries(
      platforms.map(({ directory }) => [`@imagemin-rs/binding-${directory}`, "workspace:*"]),
    );

    expect(bindingManifest.version).toBe(publicManifest.version);
    expect(bindingManifest.engines).toEqual(publicManifest.engines);
    expect(bindingManifest.files).toEqual(["LICENSE", "README.md", "src-js", "!src-js/*.node"]);
    expect(bindingManifest.optionalDependencies).toEqual(expectedOptionalDependencies);

    const loader = await readFile(
      new URL("napi/imagemin/src-js/index.js", workspaceRootUrl),
      "utf8",
    );
    const loaderVersions = new Set(
      [...loader.matchAll(/expected ([0-9A-Za-z.-]+) but got/gu)].map((match) => match[1]),
    );
    expect([...loaderVersions]).toEqual([publicManifest.version]);
    for (const platform of platforms) {
      const manifest = await readJson(
        new URL(`npm/${platform.directory}/package.json`, workspaceRootUrl),
      );
      const packageName = `@imagemin-rs/binding-${platform.directory}`;
      const binaryName = `imagemin_rs.${platform.directory}.node`;

      expect(manifest).toMatchObject({
        cpu: [platform.cpu],
        engines: publicManifest.engines,
        files: ["LICENSE", "README.md", binaryName],
        main: binaryName,
        name: packageName,
        os: [platform.os],
        version: publicManifest.version,
      });
      if ("libc" in platform) expect(manifest.libc).toEqual([platform.libc]);
      else expect(manifest.libc).toBeUndefined();
      expect(loader).toContain(`'${packageName}'`);
      await expect(
        readFile(new URL(`npm/${platform.directory}/LICENSE`, workspaceRootUrl), "utf8"),
      ).resolves.toContain("MIT License");
    }
  });

  test("builds, bundles, and smokes every release target before npm staging", async () => {
    const workflow = await readFile(
      new URL(".github/workflows/release.yml", workspaceRootUrl),
      "utf8",
    );

    for (const platform of platforms) {
      expect(workflow).toContain(`directory: ${platform.directory}`);
    }
    expect(workflow).toContain("node tasks/release/verify-packages.mjs --artifacts=all --release");
    expect(workflow).toContain("node tasks/release/smoke-packages.mjs --bundle=.release/npm");
    expect(workflow).toContain("environment: npm");
    expect(workflow).toContain("id-token: write");
    expect(workflow).toContain("publish-packages.mjs --mode=stage");
  });
});

async function readManifest(): Promise<PackageManifest> {
  return readJson(packageJsonUrl);
}

async function readJson(url: URL): Promise<PackageManifest> {
  return JSON.parse(await readFile(url, "utf8")) as PackageManifest;
}
