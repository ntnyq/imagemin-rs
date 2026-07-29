import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const cliArguments = process.argv.slice(2);
if (cliArguments[0] === "--") cliArguments.shift();
const rootFlagIndex = cliArguments.indexOf("--root");
const workspaceRoot =
  rootFlagIndex === -1
    ? fileURLToPath(new URL("../../", import.meta.url))
    : resolve(cliArguments.splice(rootFlagIndex, 2)[1] ?? "");
const nextVersion = cliArguments[0];
if (nextVersion === undefined) {
  throw new TypeError("Usage: node tasks/release/set-version.mjs <semver> [--root <dir>]");
}
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/u.test(nextVersion)) {
  throw new TypeError(`Invalid release version: ${nextVersion}`);
}
if (nextVersion === "0.0.0") {
  throw new TypeError("0.0.0 is reserved for unreleased development");
}

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
const packagePaths = [
  "package.json",
  "napi/imagemin/package.json",
  "packages/imagemin/package.json",
  ...platformDirectories.map((directory) => `npm/${directory}/package.json`),
  ...platformDirectories.map((directory) => `npm/sidecar-gifsicle-${directory}/package.json`),
  ...platformDirectories.map((directory) => `npm/sidecar-pngquant-${directory}/package.json`),
  ...platformDirectories.map((directory) => `npm/sidecars-${directory}/package.json`),
];
const rootManifest = await readJson("package.json");
const currentVersion = rootManifest.version;
assert(
  typeof currentVersion === "string" && currentVersion !== nextVersion,
  `Workspace already uses version ${nextVersion}`,
);

// Every file is read and validated before anything is written, so a failed
// precondition leaves the working tree untouched instead of half-bumped.
const pendingWrites = [];

for (const path of packagePaths) {
  const manifest = await readJson(path);
  assert(
    manifest.version === currentVersion,
    `${path} uses ${manifest.version} instead of ${currentVersion}`,
  );
  manifest.version = nextVersion;
  pendingWrites.push([path, `${JSON.stringify(manifest, undefined, 2)}\n`]);
}

// The imagemin workspace dependency line contains the bare `version = "…"`
// string as a substring, so it must be rewritten first or the bare rule
// counts two occurrences and fails.
pendingWrites.push(
  await replaceExactVersions("Cargo.toml", [
    [
      `imagemin = { version = "${currentVersion}", path = "crates/imagemin" }`,
      `imagemin = { version = "${nextVersion}", path = "crates/imagemin" }`,
      1,
    ],
    [`version = "${currentVersion}"`, `version = "${nextVersion}"`, 1],
  ]),
);
const rustPackageNames = [
  "imagemin",
  "imagemin-codec-gif",
  "imagemin-codec-png",
  "imagemin-codec-svg",
  "imagemin-core",
  "imagemin_napi",
];
for (const [path, packageNames] of [
  ["Cargo.lock", rustPackageNames],
  ["fuzz/Cargo.lock", rustPackageNames.filter((packageName) => packageName !== "imagemin_napi")],
]) {
  const lockfile = await readText(path);
  const newline = lockfile.includes("\r\n") ? "\r\n" : "\n";

  pendingWrites.push(
    await replaceExactVersions(
      path,
      packageNames.map((packageName) => [
        `name = "${packageName}"${newline}version = "${currentVersion}"`,
        `name = "${packageName}"${newline}version = "${nextVersion}"`,
        1,
      ]),
    ),
  );
}

const loaderPath = "napi/imagemin/src-js/index.js";
const loader = await readText(loaderPath);
const versionPattern = new RegExp(`(?<![\\d.])${escapeRegExp(currentVersion)}(?!\\d)`, "gu");
const versionOccurrences = [...loader.matchAll(versionPattern)].length;
assert(versionOccurrences > 0, `Generated binding loader does not contain ${currentVersion}`);
pendingWrites.push([loaderPath, loader.replaceAll(versionPattern, nextVersion)]);

const vexPath = "security/imagemin-rs.openvex.json";
const vex = await readText(vexPath);
const vexOccurrences = [...vex.matchAll(versionPattern)].length;
assert(vexOccurrences > 0, `OpenVEX document does not contain ${currentVersion}`);
const nextVex = JSON.parse(vex.replaceAll(versionPattern, nextVersion));
assert(Number.isInteger(nextVex.version), "OpenVEX document version is invalid");
nextVex.timestamp = new Date().toISOString();
nextVex.version += 1;
pendingWrites.push([vexPath, `${JSON.stringify(nextVex, undefined, 2)}\n`]);

for (const [path, value] of pendingWrites) {
  await writeFile(resolve(workspaceRoot, path), value);
}

console.log(
  JSON.stringify(
    {
      from: currentVersion,
      packages: packagePaths.length,
      tag: `v${nextVersion}`,
      to: nextVersion,
    },
    undefined,
    2,
  ),
);

async function replaceExactVersions(path, replacements) {
  let value = await readText(path);
  for (const [from, to, expectedCount] of replacements) {
    const count = value.split(from).length - 1;
    assert(count === expectedCount, `${path} expected ${expectedCount} occurrence(s) of ${from}`);
    value = value.replace(from, to);
  }
  return [path, value];
}

async function readJson(path) {
  return JSON.parse(await readText(path));
}

async function readText(path) {
  return readFile(resolve(workspaceRoot, path), "utf8");
}

function escapeRegExp(value) {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
