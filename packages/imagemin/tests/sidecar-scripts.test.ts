import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

const execFileAsync = promisify(execFile);
const workspaceRoot = fileURLToPath(new URL("../../../", import.meta.url));
const assemblePackagesScript = join(workspaceRoot, "tasks/sidecars/assemble-packages.mjs");
const fetchSourcesScript = join(workspaceRoot, "tasks/sidecars/fetch-sources.mjs");
const manifestScript = join(workspaceRoot, "tasks/sidecars/write-manifest.mjs");
const pins = JSON.parse(
  await readFile(join(workspaceRoot, "tasks/sidecars/pins.json"), "utf8"),
) as {
  cwebp: {
    sources: Record<string, { sha256: string; url: string; version: string }>;
    version: string;
  };
  mozjpeg: {
    sources: Record<string, { sha256: string; url: string; version: string }>;
    version: string;
  };
  pngquant: {
    sources: Record<string, { sha256: string; url: string; version: string }>;
    version: string;
  };
};

let sandboxRoot: string;

beforeEach(async () => {
  sandboxRoot = await mkdtemp(join(tmpdir(), "imagemin-rs-sidecar-"));
});

afterEach(async () => {
  await rm(sandboxRoot, { force: true, recursive: true });
});

describe("sidecar scripts", () => {
  test("writes a deterministic cwebp provenance manifest", async () => {
    const binary = Buffer.from("self-built-cwebp");
    const binaryPath = join(sandboxRoot, "cwebp");
    const outputPath = join(sandboxRoot, "cwebp.manifest.json");
    await writeFile(binaryPath, binary);

    await execFileAsync(process.execPath, [
      manifestScript,
      "--tool",
      "cwebp",
      "--target",
      "darwin-arm64",
      "--binary",
      binaryPath,
      "--output",
      outputPath,
    ]);

    const output = await readFile(outputPath, "utf8");
    expect(output.endsWith("\n")).toBe(true);
    expect(JSON.parse(output)).toEqual({
      binary: "cwebp",
      bytes: binary.byteLength,
      schema: 1,
      sha256: createHash("sha256").update(binary).digest("hex"),
      sources: pins.cwebp.sources,
      target: "darwin-arm64",
      tool: "cwebp",
      version: pins.cwebp.version,
    });
  });

  test("writes deterministic MozJPEG manifests for both binaries", async () => {
    for (const binaryName of ["cjpeg", "jpegtran"]) {
      const binary = Buffer.from(`self-built-${binaryName}`);
      const binaryPath = join(sandboxRoot, binaryName);
      const outputPath = join(sandboxRoot, `${binaryName}.manifest.json`);
      await writeFile(binaryPath, binary);

      await execFileAsync(process.execPath, [
        manifestScript,
        "--tool",
        "mozjpeg",
        "--target",
        "darwin-arm64",
        "--binary",
        binaryPath,
        "--output",
        outputPath,
      ]);

      expect(JSON.parse(await readFile(outputPath, "utf8"))).toEqual({
        binary: binaryName,
        bytes: binary.byteLength,
        schema: 1,
        sha256: createHash("sha256").update(binary).digest("hex"),
        sources: pins.mozjpeg.sources,
        target: "darwin-arm64",
        tool: "mozjpeg",
        version: pins.mozjpeg.version,
      });
    }
  });

  test("rejects unsupported targets before writing a manifest", async () => {
    const binaryPath = join(sandboxRoot, "cwebp");
    const outputPath = join(sandboxRoot, "cwebp.manifest.json");
    await writeFile(binaryPath, "binary");

    await expect(
      execFileAsync(process.execPath, [
        manifestScript,
        "--tool",
        "cwebp",
        "--target",
        "unknown",
        "--binary",
        binaryPath,
        "--output",
        outputPath,
      ]),
    ).rejects.toThrow(/Unsupported sidecar target/u);
    await expect(readFile(outputPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  test("writes a deterministic pngquant provenance manifest", async () => {
    const binary = Buffer.from("self-built-pngquant");
    const binaryPath = join(sandboxRoot, "pngquant");
    const outputPath = join(sandboxRoot, "pngquant.manifest.json");
    await writeFile(binaryPath, binary);

    await execFileAsync(process.execPath, [
      manifestScript,
      "--tool",
      "pngquant",
      "--target",
      "darwin-arm64",
      "--binary",
      binaryPath,
      "--output",
      outputPath,
    ]);

    expect(JSON.parse(await readFile(outputPath, "utf8"))).toEqual({
      binary: "pngquant",
      bytes: binary.byteLength,
      schema: 1,
      sha256: createHash("sha256").update(binary).digest("hex"),
      sources: pins.pngquant.sources,
      target: "darwin-arm64",
      tool: "pngquant",
      version: pins.pngquant.version,
    });
  });

  test("retries transient source download failures", async () => {
    const archive = Buffer.from("pinned-source-archive");
    let requests = 0;
    const server = createServer((_request, response) => {
      requests += 1;
      if (requests === 1) {
        response.writeHead(503).end();
        return;
      }
      response.writeHead(200, { "content-length": archive.byteLength }).end(archive);
    });
    await new Promise<void>((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));

    try {
      const address = server.address();
      if (address === null || typeof address === "string") throw new Error("Missing test server");
      const pinsPath = join(sandboxRoot, "pins.json");
      const outputDirectory = join(sandboxRoot, "sources");
      await writeFile(
        pinsPath,
        `${JSON.stringify({
          fixture: {
            sources: {
              source: {
                sha256: createHash("sha256").update(archive).digest("hex"),
                url: `http://127.0.0.1:${address.port}/source.tar.gz`,
                version: "1.0.0",
              },
            },
            version: "1.0.0",
          },
        })}\n`,
      );

      await execFileAsync(process.execPath, [
        fetchSourcesScript,
        "--tool",
        "fixture",
        "--output",
        outputDirectory,
        "--pins",
        pinsPath,
      ]);

      expect(requests).toBe(2);
      await expect(readFile(join(outputDirectory, "source-1.0.0.tar.gz"))).resolves.toEqual(
        archive,
      );
    } finally {
      await new Promise<void>((resolvePromise, reject) =>
        server.close((error) => (error === undefined ? resolvePromise() : reject(error))),
      );
    }
  });

  test("assembles a verified build artifact into its platform package", async () => {
    const target = "darwin-arm64";
    const artifactDirectory = join(sandboxRoot, "artifacts", `sidecar-cwebp-${target}`);
    const packageDirectory = join(sandboxRoot, "npm", `sidecars-${target}`);
    const binaryPath = join(artifactDirectory, "cwebp");
    const mozjpegArtifactDirectory = join(sandboxRoot, "artifacts", `sidecar-mozjpeg-${target}`);
    await mkdir(join(artifactDirectory, "licenses"), { recursive: true });
    await mkdir(join(mozjpegArtifactDirectory, "licenses"), { recursive: true });
    await mkdir(packageDirectory, { recursive: true });
    await writeFile(binaryPath, "self-built-cwebp", { mode: 0o755 });
    for (const binaryName of ["cjpeg", "jpegtran"]) {
      const mozjpegBinaryPath = join(mozjpegArtifactDirectory, binaryName);
      await writeFile(mozjpegBinaryPath, `self-built-${binaryName}`, { mode: 0o755 });
      await execFileAsync(process.execPath, [
        manifestScript,
        "--tool",
        "mozjpeg",
        "--target",
        target,
        "--binary",
        mozjpegBinaryPath,
        "--output",
        join(mozjpegArtifactDirectory, `${binaryName}.manifest.json`),
      ]);
    }
    await writeFile(
      join(packageDirectory, "package.json"),
      await readFile(join(workspaceRoot, `npm/sidecars-${target}/package.json`)),
    );
    for (const licenseFile of sidecarLicenseFiles) {
      await writeFile(join(artifactDirectory, "licenses", licenseFile), licenseFile);
    }
    for (const licenseFile of mozjpegLicenseFiles) {
      await writeFile(join(mozjpegArtifactDirectory, "licenses", licenseFile), licenseFile);
    }
    await execFileAsync(process.execPath, [
      manifestScript,
      "--tool",
      "cwebp",
      "--target",
      target,
      "--binary",
      binaryPath,
      "--output",
      join(artifactDirectory, "cwebp.manifest.json"),
    ]);

    await execFileAsync(process.execPath, [
      assemblePackagesScript,
      "--artifacts",
      join(sandboxRoot, "artifacts"),
      "--npm-dir",
      join(sandboxRoot, "npm"),
      "--targets",
      target,
      "--tools",
      "cwebp,mozjpeg",
    ]);

    await expect(readFile(join(packageDirectory, "cwebp"), "utf8")).resolves.toBe(
      "self-built-cwebp",
    );
    await expect(readFile(join(packageDirectory, "cjpeg"), "utf8")).resolves.toBe(
      "self-built-cjpeg",
    );
    await expect(readFile(join(packageDirectory, "jpegtran"), "utf8")).resolves.toBe(
      "self-built-jpegtran",
    );
    await expect(readFile(join(packageDirectory, "cwebp.manifest.json"), "utf8")).resolves.toMatch(
      /"target": "darwin-arm64"/u,
    );
    for (const licenseFile of sidecarLicenseFiles) {
      await expect(readFile(join(packageDirectory, "licenses", licenseFile), "utf8")).resolves.toBe(
        licenseFile,
      );
    }
    for (const licenseFile of mozjpegLicenseFiles) {
      await expect(readFile(join(packageDirectory, "licenses", licenseFile), "utf8")).resolves.toBe(
        licenseFile,
      );
    }
  });

  test("assembles pngquant into its GPL platform package", async () => {
    const target = "darwin-arm64";
    const artifactDirectory = join(sandboxRoot, "artifacts", `sidecar-pngquant-${target}`);
    const packageDirectory = join(sandboxRoot, "npm", `sidecar-pngquant-${target}`);
    const binaryPath = join(artifactDirectory, "pngquant");
    await mkdir(join(artifactDirectory, "licenses"), { recursive: true });
    await mkdir(packageDirectory, { recursive: true });
    await writeFile(binaryPath, "self-built-pngquant", { mode: 0o755 });
    await writeFile(
      join(packageDirectory, "package.json"),
      await readFile(join(workspaceRoot, `npm/sidecar-pngquant-${target}/package.json`)),
    );
    for (const licenseFile of pngquantLicenseFiles) {
      await writeFile(join(artifactDirectory, "licenses", licenseFile), licenseFile);
    }
    await execFileAsync(process.execPath, [
      manifestScript,
      "--tool",
      "pngquant",
      "--target",
      target,
      "--binary",
      binaryPath,
      "--output",
      join(artifactDirectory, "pngquant.manifest.json"),
    ]);

    await execFileAsync(process.execPath, [
      assemblePackagesScript,
      "--artifacts",
      join(sandboxRoot, "artifacts"),
      "--npm-dir",
      join(sandboxRoot, "npm"),
      "--targets",
      target,
      "--tools",
      "pngquant",
    ]);

    await expect(readFile(join(packageDirectory, "pngquant"), "utf8")).resolves.toBe(
      "self-built-pngquant",
    );
    await expect(
      readFile(join(packageDirectory, "pngquant.manifest.json"), "utf8"),
    ).resolves.toMatch(/"target": "darwin-arm64"/u);
    for (const licenseFile of pngquantLicenseFiles) {
      await expect(readFile(join(packageDirectory, "licenses", licenseFile), "utf8")).resolves.toBe(
        licenseFile,
      );
    }
  });
});

const sidecarLicenseFiles = [
  "libjpeg-turbo-LICENSE.md",
  "libjpeg-turbo-README.ijg",
  "libpng-LICENSE.txt",
  "libtiff-LICENSE.md",
  "libwebp-COPYING.txt",
  "libwebp-PATENTS.txt",
  "zlib-LICENSE.txt",
] as const;

const mozjpegLicenseFiles = ["mozjpeg-LICENSE.md", "mozjpeg-README.ijg"] as const;

const pngquantLicenseFiles = ["libimagequant-COPYRIGHT", "pngquant-COPYRIGHT"] as const;
