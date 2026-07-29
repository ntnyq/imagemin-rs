import { createHash } from "node:crypto";
import { chmod, copyFile, mkdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

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
const sidecarArtifacts = [
  {
    artifact: "cwebp",
    binaries: ["cwebp"],
    licenses: [
      "libjpeg-turbo-LICENSE.md",
      "libjpeg-turbo-README.ijg",
      "libpng-LICENSE.txt",
      "libtiff-LICENSE.md",
      "libwebp-COPYING.txt",
      "libwebp-PATENTS.txt",
      "zlib-LICENSE.txt",
    ],
    packagePrefix: "sidecars",
    tool: "cwebp",
  },
  {
    artifact: "mozjpeg",
    binaries: ["cjpeg", "jpegtran"],
    licenses: ["mozjpeg-LICENSE.md", "mozjpeg-README.ijg"],
    packagePrefix: "sidecars",
    tool: "mozjpeg",
  },
  {
    artifact: "pngquant",
    binaries: ["pngquant"],
    licenses: ["libimagequant-COPYRIGHT", "pngquant-COPYRIGHT"],
    packagePrefix: "sidecar-pngquant",
    tool: "pngquant",
  },
];
const cliArguments = process.argv.slice(2);
const artifactsRoot = resolve(readFlag("--artifacts"));
const npmRoot = resolve(readFlag("--npm-dir"));
const targetArgument = readFlag("--targets");
const requestedTargets = targetArgument === "all" ? platformDirectories : targetArgument.split(",");
const requestedToolNames =
  readOptionalFlag("--tools")?.split(",") ?? sidecarArtifacts.map(({ artifact }) => artifact);
const requestedSidecars = requestedToolNames.map((toolName) => {
  const sidecar = sidecarArtifacts.find(({ artifact }) => artifact === toolName);
  if (sidecar === undefined) throw new TypeError(`Unsupported sidecar tool: ${toolName}`);
  return sidecar;
});

for (const target of requestedTargets) {
  if (!platformDirectories.includes(target)) {
    throw new TypeError(`Unsupported sidecar target: ${target}`);
  }
}

const pendingCopies = [];
for (const target of requestedTargets) {
  for (const sidecar of requestedSidecars) {
    const packageRoot = join(npmRoot, `${sidecar.packagePrefix}-${target}`);
    const packageManifest = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
    assert(
      packageManifest.name === `@imagemin-rs/${sidecar.packagePrefix}-${target}`,
      `Unexpected package manifest for ${target} ${sidecar.artifact}`,
    );
    const artifactRoot = join(artifactsRoot, `sidecar-${sidecar.artifact}-${target}`);
    const binaryCopies = [];
    const manifestCopies = [];
    for (const baseName of sidecar.binaries) {
      const binaryName = target.startsWith("win32-") ? `${baseName}.exe` : baseName;
      const binaryPath = join(artifactRoot, binaryName);
      const binary = await readFile(binaryPath);
      const binaryMetadata = await stat(binaryPath);
      const manifestName = `${baseName}.manifest.json`;
      const provenance = JSON.parse(await readFile(join(artifactRoot, manifestName), "utf8"));

      assert(binaryMetadata.isFile() && binary.byteLength > 0, `${target} ${baseName} is empty`);
      assert(provenance.schema === 1, `${target} ${baseName} manifest schema is invalid`);
      assert(
        provenance.tool === sidecar.tool,
        `${target} artifact does not describe ${sidecar.tool}`,
      );
      assert(provenance.target === target, `${target} artifact manifest target is invalid`);
      assert(provenance.binary === binaryName, `${target} artifact binary name is invalid`);
      assert(provenance.bytes === binary.byteLength, `${target} artifact byte count is invalid`);
      assert(
        provenance.sha256 === createHash("sha256").update(binary).digest("hex"),
        `${target} artifact checksum is invalid`,
      );
      binaryCopies.push([binaryPath, join(packageRoot, binaryName)]);
      manifestCopies.push([join(artifactRoot, manifestName), join(packageRoot, manifestName)]);
    }

    const licenseCopies = [];
    for (const licenseFile of sidecar.licenses) {
      const path = join(artifactRoot, "licenses", licenseFile);
      const metadata = await stat(path);
      assert(
        metadata.isFile() && metadata.size > 0,
        `${target} artifact is missing ${licenseFile}`,
      );
      licenseCopies.push([path, join(packageRoot, "licenses", licenseFile)]);
    }
    pendingCopies.push({
      binaries: binaryCopies,
      licenses: licenseCopies,
      manifests: manifestCopies,
      packageRoot,
      target,
    });
  }
}

for (const item of pendingCopies) {
  await mkdir(join(item.packageRoot, "licenses"), { recursive: true });
  for (const binary of item.binaries) {
    await copyFile(...binary);
    if (!item.target.startsWith("win32-")) await chmod(binary[1], 0o755);
  }
  for (const manifest of item.manifests) await copyFile(...manifest);
  for (const license of item.licenses) await copyFile(...license);
}

console.log(
  JSON.stringify({ assembled: requestedTargets, tools: requestedToolNames }, undefined, 2),
);

function readFlag(flag) {
  const value = readOptionalFlag(flag);
  if (value === undefined) {
    throw new TypeError(
      "Usage: node tasks/sidecars/assemble-packages.mjs --artifacts <dir> --npm-dir <dir> --targets <target,...> [--tools <tool,...>]",
    );
  }
  return value;
}

function readOptionalFlag(flag) {
  const index = cliArguments.indexOf(flag);
  const value = index === -1 ? undefined : cliArguments[index + 1];
  return value === undefined || value.startsWith("--") ? undefined : value;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
