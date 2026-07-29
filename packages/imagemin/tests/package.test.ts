import { readFile } from "node:fs/promises";

import { describe, expect, test } from "vitest";

interface PackageManifest {
  bin?: Record<string, string>;
  cpu?: string[];
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
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

  test("keeps native bindings and sidecars optional at the public package boundary", async () => {
    const manifest = await readManifest();

    expect(manifest.optionalDependencies).toEqual({
      "@imagemin-rs/binding": "workspace:*",
      ...Object.fromEntries(
        platforms.map(({ directory }) => [
          `@imagemin-rs/sidecar-pngquant-${directory}`,
          "workspace:*",
        ]),
      ),
      ...Object.fromEntries(
        platforms.map(({ directory }) => [`@imagemin-rs/sidecars-${directory}`, "workspace:*"]),
      ),
    });
  });

  test("keeps upstream binary download wrappers out of production dependencies", async () => {
    const manifest = await readManifest();

    for (const packageName of ["cwebp-bin", "jpegtran-bin", "mozjpeg", "pngquant-bin"]) {
      expect(manifest.dependencies).not.toHaveProperty(packageName);
      expect(manifest.devDependencies).toHaveProperty(packageName);
    }
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

      const sidecarManifest = await readJson(
        new URL(`npm/sidecars-${platform.directory}/package.json`, workspaceRootUrl),
      );
      const sidecarBinaries = Object.fromEntries(
        ["cjpeg", "cwebp", "jpegtran"].map((binary) => [
          binary,
          platform.os === "win32" ? `${binary}.exe` : binary,
        ]),
      );
      expect(sidecarManifest).toMatchObject({
        bin: sidecarBinaries,
        cpu: [platform.cpu],
        engines: publicManifest.engines,
        files: [
          "README.md",
          ...Object.entries(sidecarBinaries).flatMap(([binary, file]) => [
            file,
            `${binary}.manifest.json`,
          ]),
          "licenses",
        ],
        name: `@imagemin-rs/sidecars-${platform.directory}`,
        os: [platform.os],
        version: publicManifest.version,
      });
      if ("libc" in platform) expect(sidecarManifest.libc).toEqual([platform.libc]);
      else expect(sidecarManifest.libc).toBeUndefined();

      const pngquantManifest = await readJson(
        new URL(`npm/sidecar-pngquant-${platform.directory}/package.json`, workspaceRootUrl),
      );
      const pngquantBinary = platform.os === "win32" ? "pngquant.exe" : "pngquant";
      expect(pngquantManifest).toMatchObject({
        bin: { pngquant: pngquantBinary },
        cpu: [platform.cpu],
        engines: publicManifest.engines,
        files: ["README.md", pngquantBinary, "pngquant.manifest.json", "licenses"],
        license: "GPL-3.0-or-later",
        name: `@imagemin-rs/sidecar-pngquant-${platform.directory}`,
        os: [platform.os],
        version: publicManifest.version,
      });
      if ("libc" in platform) expect(pngquantManifest.libc).toEqual([platform.libc]);
      else expect(pngquantManifest.libc).toBeUndefined();
    }
  });

  test("builds, bundles, and smokes every release target before npm staging", async () => {
    const workflow = await readFile(
      new URL(".github/workflows/release.yml", workspaceRootUrl),
      "utf8",
    );
    const sidecarWorkflow = await readFile(
      new URL(".github/workflows/sidecars.yml", workspaceRootUrl),
      "utf8",
    );

    for (const platform of platforms) {
      expect(workflow).toContain(`directory: ${platform.directory}`);
      expect(sidecarWorkflow).toContain(`directory: ${platform.directory}`);
    }
    expect(workflow).toContain("uses: ./.github/workflows/sidecars.yml");
    expect(workflow).toContain("node tasks/sidecars/assemble-packages.mjs");
    expect(workflow).toContain("node tasks/release/verify-packages.mjs --artifacts=all --release");
    expect(workflow).toContain("node tasks/release/smoke-packages.mjs --bundle=.release/npm");
    expect(workflow).toContain("environment: npm");
    expect(workflow).toContain("id-token: write");
    expect(workflow).toContain("publish-packages.mjs --mode=stage");
    expect(sidecarWorkflow).toContain("tasks/sidecars/build-cwebp.sh");
    expect(sidecarWorkflow).toContain("tasks/sidecars/smoke-cwebp.mjs");
    expect(sidecarWorkflow).toContain("tasks/sidecars/build-mozjpeg.sh");
    expect(sidecarWorkflow).toContain("tasks/sidecars/smoke-mozjpeg.mjs");
    expect(sidecarWorkflow).toContain("tasks/sidecars/build-pngquant.sh");
    expect(sidecarWorkflow).toContain("tasks/sidecars/smoke-pngquant.mjs");
  });
});

async function readManifest(): Promise<PackageManifest> {
  return readJson(packageJsonUrl);
}

async function readJson(url: URL): Promise<PackageManifest> {
  return JSON.parse(await readFile(url, "utf8")) as PackageManifest;
}
