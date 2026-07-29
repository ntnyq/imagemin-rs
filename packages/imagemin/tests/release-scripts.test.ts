import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

const execFileAsync = promisify(execFile);
const workspaceRoot = fileURLToPath(new URL("../../../", import.meta.url));
const setVersionScript = join(workspaceRoot, "tasks/release/set-version.mjs");
const writeBundleSbomScript = join(workspaceRoot, "tasks/release/write-bundle-sbom.mjs");
const writeDependencySbomScript = join(workspaceRoot, "tasks/release/write-dependency-sbom.mjs");
const writePlatformSbomScript = join(workspaceRoot, "tasks/release/write-platform-sbom.mjs");
const platformDirectories = [
  "darwin-arm64",
  "darwin-x64",
  "linux-arm64-gnu",
  "linux-arm64-musl",
  "linux-x64-gnu",
  "linux-x64-musl",
  "win32-arm64-msvc",
  "win32-x64-msvc",
];
const sidecarManifestPaths = platformDirectories.map(
  (directory) => `npm/sidecars-${directory}/package.json`,
);
const pngquantManifestPaths = platformDirectories.map(
  (directory) => `npm/sidecar-pngquant-${directory}/package.json`,
);
const gifsicleManifestPaths = platformDirectories.map(
  (directory) => `npm/sidecar-gifsicle-${directory}/package.json`,
);
const manifestPaths = [
  "package.json",
  "napi/imagemin/package.json",
  "packages/imagemin/package.json",
  ...platformDirectories.map((directory) => `npm/${directory}/package.json`),
  ...gifsicleManifestPaths,
  ...pngquantManifestPaths,
  ...sidecarManifestPaths,
];
const versionedPaths = [
  ...manifestPaths,
  "Cargo.toml",
  "Cargo.lock",
  "fuzz/Cargo.lock",
  "napi/imagemin/src-js/index.js",
];

let sandboxRoot: string;

beforeEach(async () => {
  sandboxRoot = await mkdtemp(join(tmpdir(), "imagemin-rs-set-version-"));
  for (const path of versionedPaths) {
    const destination = join(sandboxRoot, path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, await readFile(join(workspaceRoot, path)));
  }
});

afterEach(() => {
  sandboxRoot = "";
});

describe("set-version", () => {
  test("bumps every versioned file consistently, including prerelease chains", async () => {
    const first = await runSetVersion("7.7.7-sandbox.0");
    expect(JSON.parse(first.stdout)).toMatchObject({
      packages: manifestPaths.length,
      tag: "v7.7.7-sandbox.0",
      to: "7.7.7-sandbox.0",
    });
    await expectSandboxVersion("7.7.7-sandbox.0");

    // A second bump exercises the Cargo.toml substring ordering again with a
    // prerelease current version.
    await runSetVersion("7.7.7-sandbox.1");
    await expectSandboxVersion("7.7.7-sandbox.1");
  });

  test("updates the imagemin workspace dependency alongside the workspace version", async () => {
    const manifest = JSON.parse(await readSandboxFile("package.json")) as { version: string };
    await runSetVersion("7.7.7");

    const cargoToml = await readSandboxFile("Cargo.toml");
    expect(cargoToml).toContain('version = "7.7.7"');
    expect(cargoToml).toContain('imagemin = { version = "7.7.7", path = "crates/imagemin" }');
    expect(cargoToml).not.toContain(`version = "${manifest.version}"`);
  });

  test("updates Cargo.lock after a CRLF checkout without changing its line endings", async () => {
    const cargoLockPath = join(sandboxRoot, "Cargo.lock");
    const cargoLock = await readSandboxFile("Cargo.lock");
    await writeFile(cargoLockPath, cargoLock.replaceAll("\n", "\r\n"));

    await runSetVersion("7.7.7");

    const updatedCargoLock = await readSandboxFile("Cargo.lock");
    expect(updatedCargoLock).toContain('name = "imagemin"\r\nversion = "7.7.7"');
    expect(updatedCargoLock).not.toMatch(/(?<!\r)\n/u);
  });

  test("updates the independent fuzz workspace lockfile", async () => {
    await runSetVersion("7.7.7");

    const cargoLock = await readSandboxFile("fuzz/Cargo.lock");
    for (const packageName of rustPackageNames.filter((name) => name !== "imagemin_napi")) {
      expect(cargoLock).toContain(`name = "${packageName}"\nversion = "7.7.7"`);
    }
  });

  test("leaves the tree untouched when any precondition fails", async () => {
    const driftedPath = join(sandboxRoot, "npm/win32-x64-msvc/package.json");
    const drifted = JSON.parse(await readFile(driftedPath, "utf8")) as { version: string };
    drifted.version = "9.9.9";
    await writeFile(driftedPath, `${JSON.stringify(drifted, undefined, 2)}\n`);
    const before = await snapshotSandbox();

    await expect(runSetVersion("7.7.7")).rejects.toThrow(/9\.9\.9/u);
    await expect(snapshotSandbox()).resolves.toEqual(before);
  });

  test("rejects the reserved development version and malformed versions", async () => {
    await expect(runSetVersion("0.0.0")).rejects.toThrow(/reserved/u);
    await expect(runSetVersion("1.2")).rejects.toThrow(/Invalid release version/u);
    await expect(runSetVersion("v1.2.3")).rejects.toThrow(/Invalid release version/u);
  });
});

describe("write-bundle-sbom", () => {
  test("writes a deterministic CycloneDX inventory for tarballs and pinned sources", async () => {
    const root = await mkdtemp(join(tmpdir(), "imagemin-rs-bundle-sbom-"));
    const manifestPath = join(root, "release-manifest.json");
    const pinsPath = join(root, "pins.json");
    const outputPath = join(root, "release-sbom.cdx.json");
    await writeFile(
      manifestPath,
      `${JSON.stringify({
        artifactMode: "current",
        packages: [
          {
            bytes: 42,
            integrity: `sha512-${Buffer.alloc(64, 7).toString("base64")}`,
            name: "imagemin-rs",
            tarball: "imagemin-rs-1.2.3.tgz",
            version: "1.2.3",
          },
        ],
        version: "1.2.3",
      })}\n`,
    );
    await writeFile(
      pinsPath,
      `${JSON.stringify({
        gifsicle: {
          sources: {
            gifsicle: {
              sha256: "a".repeat(64),
              url: "https://example.com/gifsicle.tar.gz",
              version: "1.96",
            },
          },
          version: "1.96",
        },
      })}\n`,
    );

    await execFileAsync(process.execPath, [
      writeBundleSbomScript,
      "--manifest",
      manifestPath,
      "--pins",
      pinsPath,
      "--output",
      outputPath,
    ]);
    const first = await readFile(outputPath, "utf8");
    const sbom = JSON.parse(first) as {
      bomFormat: string;
      components: Array<{
        hashes: Array<{ alg: string; content: string }>;
        name: string;
        version: string;
      }>;
      metadata: { properties: Array<{ name: string; value: string }> };
      serialNumber: string;
      specVersion: string;
    };

    expect(sbom).toMatchObject({
      bomFormat: "CycloneDX",
      specVersion: "1.6",
    });
    expect(sbom.serialNumber).toMatch(/^urn:uuid:[\da-f-]{36}$/u);
    expect(sbom.metadata.properties).toContainEqual({
      name: "imagemin-rs:artifact-mode",
      value: "current",
    });
    expect(sbom.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          hashes: [
            {
              alg: "SHA-512",
              content: Buffer.alloc(64, 7).toString("hex"),
            },
          ],
          name: "imagemin-rs",
          version: "1.2.3",
        }),
        expect.objectContaining({
          hashes: [{ alg: "SHA-256", content: "a".repeat(64) }],
          name: "gifsicle",
          version: "1.96",
        }),
      ]),
    );

    await execFileAsync(process.execPath, [
      writeBundleSbomScript,
      "--manifest",
      manifestPath,
      "--pins",
      pinsPath,
      "--output",
      outputPath,
    ]);
    await expect(readFile(outputPath, "utf8")).resolves.toBe(first);
  });

  test("rejects malformed package integrity", async () => {
    const root = await mkdtemp(join(tmpdir(), "imagemin-rs-bundle-sbom-invalid-"));
    const manifestPath = join(root, "release-manifest.json");
    const pinsPath = join(root, "pins.json");
    await writeFile(
      manifestPath,
      `${JSON.stringify({
        artifactMode: "current",
        packages: [
          {
            bytes: 42,
            integrity: "sha512-invalid",
            name: "imagemin-rs",
            tarball: "imagemin-rs-1.2.3.tgz",
            version: "1.2.3",
          },
        ],
        version: "1.2.3",
      })}\n`,
    );
    await writeFile(pinsPath, "{}\n");

    await expect(
      execFileAsync(process.execPath, [
        writeBundleSbomScript,
        "--manifest",
        manifestPath,
        "--pins",
        pinsPath,
        "--output",
        join(root, "release-sbom.cdx.json"),
      ]),
    ).rejects.toThrow(/integrity/u);
  });
});

describe("write-dependency-sbom", () => {
  test("records the locked Rust and production npm dependency closures deterministically", async () => {
    const root = await mkdtemp(join(tmpdir(), "imagemin-rs-dependency-sbom-"));
    const outputPath = join(root, "release-dependencies.cdx.json");
    const releaseVersion = (
      JSON.parse(await readFile(join(workspaceRoot, "packages/imagemin/package.json"), "utf8")) as {
        version: string;
      }
    ).version;

    await execFileAsync(process.execPath, [
      writeDependencySbomScript,
      "--root",
      workspaceRoot,
      "--output",
      outputPath,
    ]);
    const first = await readFile(outputPath, "utf8");
    const sbom = JSON.parse(first) as {
      bomFormat: string;
      components: Array<{ name: string; version: string }>;
      dependencies: Array<{ dependsOn: string[]; ref: string }>;
      metadata: { component: { name: string; version: string } };
      specVersion: string;
    };

    expect(sbom).toMatchObject({
      bomFormat: "CycloneDX",
      metadata: {
        component: {
          name: "imagemin-rs dependency closure",
          version: releaseVersion,
        },
      },
      specVersion: "1.6",
    });
    expect(sbom.components.length).toBeGreaterThan(150);
    expect(sbom.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "imagemin_napi", version: releaseVersion }),
        expect.objectContaining({ name: "oxipng" }),
        expect.objectContaining({ name: "sharp", version: "0.35.3" }),
        expect.objectContaining({
          name: "@img/sharp-libvips-darwin-arm64",
        }),
      ]),
    );
    expect(sbom.dependencies.some(({ dependsOn }) => dependsOn.length > 10)).toBe(true);
    expect(first).not.toContain(workspaceRoot);

    await execFileAsync(process.execPath, [
      writeDependencySbomScript,
      "--root",
      workspaceRoot,
      "--output",
      outputPath,
    ]);
    await expect(readFile(outputPath, "utf8")).resolves.toBe(first);
  });
});

describe("write-platform-sbom", () => {
  test("records installed Sharp packages, embedded libraries, and native file hashes", async () => {
    const root = await mkdtemp(join(tmpdir(), "imagemin-rs-platform-sbom-"));
    const packageRoot = join(root, "node_modules/@img/sharp-test-platform");
    const nativePath = join(packageRoot, "lib/sharp-test.node");
    const versionsPath = join(root, "sharp-versions.json");
    const outputPath = join(root, "test-platform.cdx.json");
    await mkdir(dirname(nativePath), { recursive: true });
    await writeFile(
      join(packageRoot, "package.json"),
      `${JSON.stringify({
        license: "Apache-2.0",
        name: "@img/sharp-test-platform",
        version: "1.2.3",
      })}\n`,
    );
    await writeFile(nativePath, Buffer.from("native-fixture"));
    await writeFile(
      versionsPath,
      `${JSON.stringify({ sharp: "0.35.3", vips: "8.18.3", webp: "1.6.0" })}\n`,
    );

    await execFileAsync(process.execPath, [
      writePlatformSbomScript,
      "--root",
      root,
      "--platform",
      "test-platform",
      "--version",
      "1.2.3",
      "--versions",
      versionsPath,
      "--output",
      outputPath,
    ]);
    const first = await readFile(outputPath, "utf8");
    const sbom = JSON.parse(first) as {
      components: Array<{
        hashes?: Array<{ alg: string; content: string }>;
        name: string;
        type: string;
        version?: string;
      }>;
      metadata: { properties: Array<{ name: string; value: string }> };
    };

    expect(sbom.metadata.properties).toContainEqual({
      name: "imagemin-rs:platform",
      value: "test-platform",
    });
    expect(sbom.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "@img/sharp-test-platform",
          type: "library",
          version: "1.2.3",
        }),
        expect.objectContaining({
          name: "vips",
          type: "library",
          version: "8.18.3",
        }),
        expect.objectContaining({
          hashes: [
            {
              alg: "SHA-256",
              content: createHash("sha256").update("native-fixture").digest("hex"),
            },
          ],
          name: "node_modules/@img/sharp-test-platform/lib/sharp-test.node",
          type: "file",
        }),
      ]),
    );

    await execFileAsync(process.execPath, [
      writePlatformSbomScript,
      "--root",
      root,
      "--platform",
      "test-platform",
      "--version",
      "1.2.3",
      "--versions",
      versionsPath,
      "--output",
      outputPath,
    ]);
    await expect(readFile(outputPath, "utf8")).resolves.toBe(first);
  });
});

async function runSetVersion(version: string): Promise<{ stderr: string; stdout: string }> {
  return execFileAsync(process.execPath, [setVersionScript, version, "--root", sandboxRoot]);
}

async function readSandboxFile(path: string): Promise<string> {
  return readFile(join(sandboxRoot, path), "utf8");
}

async function snapshotSandbox(): Promise<Record<string, string>> {
  const entries = await Promise.all(
    versionedPaths.map(async (path) => [path, await readSandboxFile(path)] as const),
  );
  return Object.fromEntries(entries);
}

async function expectSandboxVersion(version: string): Promise<void> {
  for (const path of manifestPaths) {
    const manifest = JSON.parse(await readSandboxFile(path)) as { version: string };
    expect(manifest.version, path).toBe(version);
  }

  const cargoToml = await readSandboxFile("Cargo.toml");
  expect(cargoToml).toContain(`version = "${version}"`);
  expect(cargoToml).toContain(`imagemin = { version = "${version}", path = "crates/imagemin" }`);

  for (const [path, packageNames] of [
    ["Cargo.lock", rustPackageNames],
    ["fuzz/Cargo.lock", rustPackageNames.filter((name) => name !== "imagemin_napi")],
  ] as const) {
    const cargoLock = await readSandboxFile(path);
    for (const packageName of packageNames) {
      expect(cargoLock).toContain(`name = "${packageName}"\nversion = "${version}"`);
    }
  }

  const loader = await readSandboxFile("napi/imagemin/src-js/index.js");
  const loaderVersions = new Set(
    [...loader.matchAll(/expected ([0-9A-Za-z.-]+) but got/gu)].map((match) => match[1]),
  );
  expect([...loaderVersions]).toEqual([version]);
}

const rustPackageNames = [
  "imagemin",
  "imagemin-codec-gif",
  "imagemin-codec-png",
  "imagemin-codec-svg",
  "imagemin-core",
  "imagemin_napi",
] as const;
