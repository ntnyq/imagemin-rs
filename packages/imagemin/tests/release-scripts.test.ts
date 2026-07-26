import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

const execFileAsync = promisify(execFile);
const workspaceRoot = fileURLToPath(new URL("../../../", import.meta.url));
const setVersionScript = join(workspaceRoot, "tasks/release/set-version.mjs");
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
const manifestPaths = [
  "package.json",
  "napi/imagemin/package.json",
  "packages/imagemin/package.json",
  ...platformDirectories.map((directory) => `npm/${directory}/package.json`),
];
const versionedPaths = [
  ...manifestPaths,
  "Cargo.toml",
  "Cargo.lock",
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

  const cargoLock = await readSandboxFile("Cargo.lock");
  for (const packageName of [
    "imagemin",
    "imagemin-codec-gif",
    "imagemin-codec-png",
    "imagemin-codec-svg",
    "imagemin-core",
    "imagemin_napi",
  ]) {
    expect(cargoLock).toContain(`name = "${packageName}"\nversion = "${version}"`);
  }

  const loader = await readSandboxFile("napi/imagemin/src-js/index.js");
  const loaderVersions = new Set(
    [...loader.matchAll(/expected ([0-9A-Za-z.-]+) but got/gu)].map((match) => match[1]),
  );
  expect([...loaderVersions]).toEqual([version]);
}
