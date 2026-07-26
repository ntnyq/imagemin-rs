import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = fileURLToPath(new URL("../../", import.meta.url));
const nextVersion = process.argv[2];
if (nextVersion === undefined) {
  throw new TypeError("Usage: node tasks/release/set-version.mjs <semver>");
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
];
const rootManifest = await readJson("package.json");
const currentVersion = rootManifest.version;
assert(
  typeof currentVersion === "string" && currentVersion !== nextVersion,
  `Workspace already uses version ${nextVersion}`,
);

for (const path of packagePaths) {
  const manifest = await readJson(path);
  assert(
    manifest.version === currentVersion,
    `${path} uses ${manifest.version} instead of ${currentVersion}`,
  );
  manifest.version = nextVersion;
  await writeFile(resolve(workspaceRoot, path), `${JSON.stringify(manifest, undefined, 2)}\n`);
}

await replaceExactVersions("Cargo.toml", [
  [`version = "${currentVersion}"`, `version = "${nextVersion}"`, 1],
  [
    `imagemin = { version = "${currentVersion}", path = "crates/imagemin" }`,
    `imagemin = { version = "${nextVersion}", path = "crates/imagemin" }`,
    1,
  ],
]);
const rustPackageNames = [
  "imagemin",
  "imagemin-codec-gif",
  "imagemin-codec-png",
  "imagemin-codec-svg",
  "imagemin-core",
  "imagemin_napi",
];
await replaceExactVersions(
  "Cargo.lock",
  rustPackageNames.map((packageName) => [
    `name = "${packageName}"\nversion = "${currentVersion}"`,
    `name = "${packageName}"\nversion = "${nextVersion}"`,
    1,
  ]),
);

const loaderPath = "napi/imagemin/src-js/index.js";
const loader = await readText(loaderPath);
const versionPattern = new RegExp(escapeRegExp(currentVersion), "gu");
const versionOccurrences = [...loader.matchAll(versionPattern)].length;
assert(versionOccurrences > 0, `Generated binding loader does not contain ${currentVersion}`);
await writeFile(resolve(workspaceRoot, loaderPath), loader.replaceAll(currentVersion, nextVersion));

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
  await writeFile(resolve(workspaceRoot, path), value);
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
