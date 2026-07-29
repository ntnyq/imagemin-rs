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
const licenseFiles = [
  "libjpeg-turbo-LICENSE.md",
  "libjpeg-turbo-README.ijg",
  "libpng-LICENSE.txt",
  "libtiff-LICENSE.md",
  "libwebp-COPYING.txt",
  "libwebp-PATENTS.txt",
  "zlib-LICENSE.txt",
];
const cliArguments = process.argv.slice(2);
const artifactsRoot = resolve(readFlag("--artifacts"));
const npmRoot = resolve(readFlag("--npm-dir"));
const targetArgument = readFlag("--targets");
const requestedTargets = targetArgument === "all" ? platformDirectories : targetArgument.split(",");

for (const target of requestedTargets) {
  if (!platformDirectories.includes(target)) {
    throw new TypeError(`Unsupported sidecar target: ${target}`);
  }
}

const pendingCopies = [];
for (const target of requestedTargets) {
  const binaryName = target.startsWith("win32-") ? "cwebp.exe" : "cwebp";
  const artifactRoot = join(artifactsRoot, `sidecar-cwebp-${target}`);
  const packageRoot = join(npmRoot, `sidecars-${target}`);
  const binaryPath = join(artifactRoot, binaryName);
  const binary = await readFile(binaryPath);
  const binaryMetadata = await stat(binaryPath);
  const provenance = JSON.parse(await readFile(join(artifactRoot, "cwebp.manifest.json"), "utf8"));
  const packageManifest = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));

  assert(
    packageManifest.name === `@imagemin-rs/sidecars-${target}`,
    `Unexpected package manifest for ${target}`,
  );
  assert(binaryMetadata.isFile() && binary.byteLength > 0, `${target} cwebp is empty`);
  assert(provenance.schema === 1, `${target} cwebp manifest schema is invalid`);
  assert(provenance.tool === "cwebp", `${target} artifact does not describe cwebp`);
  assert(provenance.target === target, `${target} artifact manifest target is invalid`);
  assert(provenance.binary === binaryName, `${target} artifact binary name is invalid`);
  assert(provenance.bytes === binary.byteLength, `${target} artifact byte count is invalid`);
  assert(
    provenance.sha256 === createHash("sha256").update(binary).digest("hex"),
    `${target} artifact checksum is invalid`,
  );

  const licensePaths = [];
  for (const licenseFile of licenseFiles) {
    const path = join(artifactRoot, "licenses", licenseFile);
    const metadata = await stat(path);
    assert(metadata.isFile() && metadata.size > 0, `${target} artifact is missing ${licenseFile}`);
    licensePaths.push([path, join(packageRoot, "licenses", licenseFile)]);
  }
  pendingCopies.push({
    binary: [binaryPath, join(packageRoot, binaryName)],
    licenses: licensePaths,
    manifest: [join(artifactRoot, "cwebp.manifest.json"), join(packageRoot, "cwebp.manifest.json")],
    packageRoot,
    target,
  });
}

for (const item of pendingCopies) {
  await mkdir(join(item.packageRoot, "licenses"), { recursive: true });
  await copyFile(...item.binary);
  if (!item.target.startsWith("win32-")) await chmod(item.binary[1], 0o755);
  await copyFile(...item.manifest);
  for (const license of item.licenses) await copyFile(...license);
}

console.log(JSON.stringify({ assembled: requestedTargets }, undefined, 2));

function readFlag(flag) {
  const index = cliArguments.indexOf(flag);
  const value = index === -1 ? undefined : cliArguments[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new TypeError(
      "Usage: node tasks/sidecars/assemble-packages.mjs --artifacts <dir> --npm-dir <dir> --targets <target,...>",
    );
  }
  return value;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
