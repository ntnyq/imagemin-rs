import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const workspaceRoot = fileURLToPath(new URL("../../", import.meta.url));
const outputDirectory = resolve(workspaceRoot, readArgument("--output") ?? ".release/npm");
const artifactMode = readArgument("--artifacts") ?? "all";

if (!["all", "current"].includes(artifactMode)) {
  throw new TypeError("--artifacts must be all or current");
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
const sidecarLicenseFiles = [
  "libjpeg-turbo-LICENSE.md",
  "libjpeg-turbo-README.ijg",
  "libpng-LICENSE.txt",
  "libtiff-LICENSE.md",
  "libwebp-COPYING.txt",
  "libwebp-PATENTS.txt",
  "mozjpeg-LICENSE.md",
  "mozjpeg-README.ijg",
  "zlib-LICENSE.txt",
];
const sidecarBinaryNames = ["cjpeg", "cwebp", "jpegtran"];
const pngquantLicenseFiles = ["libimagequant-COPYRIGHT", "pngquant-COPYRIGHT"];
const selectedPlatforms =
  artifactMode === "all" ? platformDirectories : [currentPlatformDirectory()];
const packageDirectories = [
  ...selectedPlatforms.map((directory) => `npm/${directory}`),
  ...selectedPlatforms.map((directory) => `npm/sidecar-pngquant-${directory}`),
  ...selectedPlatforms.map((directory) => `npm/sidecars-${directory}`),
  "napi/imagemin",
  "packages/imagemin",
];

await prepareEmptyOutputDirectory();

for (const packageDirectory of packageDirectories) {
  await run("pnpm", ["pack", "--pack-destination", outputDirectory], {
    cwd: resolve(workspaceRoot, packageDirectory),
  });
}

const version = JSON.parse(
  await readFile(resolve(workspaceRoot, "packages/imagemin/package.json"), "utf8"),
).version;
const tarballNames = (await readdir(outputDirectory))
  .filter((name) => name.endsWith(".tgz"))
  .sort();
const expectedTarballCount = selectedPlatforms.length * 3 + 2;
assert(
  tarballNames.length === expectedTarballCount,
  `Expected ${expectedTarballCount} tarballs, found ${tarballNames.length}`,
);

const packages = [];
for (const tarballName of tarballNames) {
  const tarballPath = resolve(outputDirectory, tarballName);
  const tarball = await readFile(tarballPath);
  const entries = readTarEntries(gunzipSync(tarball));
  const manifestEntry = entries.find(({ name }) => name === "package/package.json");
  assert(manifestEntry !== undefined, `${tarballName} has no package/package.json`);
  const manifest = JSON.parse(manifestEntry.data.toString("utf8"));

  assert(manifest.version === version, `${manifest.name} does not use version ${version}`);
  assert(
    !JSON.stringify(manifest).includes("workspace:") &&
      !JSON.stringify(manifest).includes("catalog:"),
    `${manifest.name} contains an unpublished workspace or catalog protocol`,
  );
  assertTarballContract(manifest, entries);

  packages.push({
    bytes: tarball.byteLength,
    integrity: `sha512-${createHash("sha512").update(tarball).digest("base64")}`,
    name: manifest.name,
    tarball: tarballName,
    version: manifest.version,
  });
}

assert(
  packages.some(({ name }) => name === "imagemin-rs"),
  "The public package tarball is missing",
);
assert(
  packages.some(({ name }) => name === "@imagemin-rs/binding"),
  "The binding package tarball is missing",
);
for (const directory of selectedPlatforms) {
  assert(
    packages.some(({ name }) => name === `@imagemin-rs/binding-${directory}`),
    `The ${directory} platform tarball is missing`,
  );
  assert(
    packages.some(({ name }) => name === `@imagemin-rs/sidecars-${directory}`),
    `The ${directory} sidecar tarball is missing`,
  );
  assert(
    packages.some(({ name }) => name === `@imagemin-rs/sidecar-pngquant-${directory}`),
    `The ${directory} pngquant tarball is missing`,
  );
}

const bundle = {
  artifactMode,
  packages: packages.sort((left, right) => left.name.localeCompare(right.name)),
  version,
};
await writeFile(
  resolve(outputDirectory, "release-manifest.json"),
  `${JSON.stringify(bundle, undefined, 2)}\n`,
);
console.log(JSON.stringify(bundle, undefined, 2));

function assertTarballContract(manifest, entries) {
  const entryNames = new Set(entries.map(({ name }) => name));
  for (const path of ["package/README.md", "package/package.json"]) {
    assert(entryNames.has(path), `${manifest.name} tarball is missing ${path}`);
  }

  if (manifest.name.startsWith("@imagemin-rs/sidecar-pngquant-")) {
    const directory = manifest.name.slice("@imagemin-rs/sidecar-pngquant-".length);
    assert(platformDirectories.includes(directory), `Unexpected pngquant package ${manifest.name}`);
    const binaryName = directory.startsWith("win32-") ? "pngquant.exe" : "pngquant";
    for (const path of [
      `package/${binaryName}`,
      "package/pngquant.manifest.json",
      ...pngquantLicenseFiles.map((name) => `package/licenses/${name}`),
    ]) {
      assert(entryNames.has(path), `${manifest.name} tarball is missing ${path}`);
    }
    assert(
      entries.find(({ name }) => name === `package/${binaryName}`)?.data.byteLength > 0,
      `${manifest.name} pngquant is empty`,
    );
    return;
  }

  if (manifest.name.startsWith("@imagemin-rs/sidecars-")) {
    const directory = manifest.name.slice("@imagemin-rs/sidecars-".length);
    assert(platformDirectories.includes(directory), `Unexpected sidecar package ${manifest.name}`);
    const binaries = sidecarBinaryNames.map((baseName) => ({
      baseName,
      fileName: directory.startsWith("win32-") ? `${baseName}.exe` : baseName,
    }));
    for (const path of [
      ...binaries.flatMap(({ baseName, fileName }) => [
        `package/${fileName}`,
        `package/${baseName}.manifest.json`,
      ]),
      ...sidecarLicenseFiles.map((name) => `package/licenses/${name}`),
    ]) {
      assert(entryNames.has(path), `${manifest.name} tarball is missing ${path}`);
    }
    for (const binary of binaries) {
      assert(
        entries.find(({ name }) => name === `package/${binary.fileName}`)?.data.byteLength > 0,
        `${manifest.name} ${binary.baseName} is empty`,
      );
    }
    return;
  }

  assert(entryNames.has("package/LICENSE"), `${manifest.name} tarball is missing package/LICENSE`);

  if (manifest.name === "imagemin-rs") {
    const expected = {
      "@imagemin-rs/binding": version,
      ...Object.fromEntries(
        platformDirectories.map((directory) => [`@imagemin-rs/sidecars-${directory}`, version]),
      ),
      ...Object.fromEntries(
        platformDirectories.map((directory) => [
          `@imagemin-rs/sidecar-pngquant-${directory}`,
          version,
        ]),
      ),
    };
    assertDeepEqual(
      manifest.optionalDependencies,
      expected,
      "The public tarball optional dependency matrix is invalid",
    );
    for (const path of [
      "package/dist/index.d.mts",
      "package/dist/index.mjs",
      "package/THIRD_PARTY_NOTICES.md",
    ]) {
      assert(entryNames.has(path), `The public tarball is missing ${path}`);
    }
    return;
  }

  if (manifest.name === "@imagemin-rs/binding") {
    const expected = Object.fromEntries(
      platformDirectories.map((directory) => [`@imagemin-rs/binding-${directory}`, version]),
    );
    assertDeepEqual(
      manifest.optionalDependencies,
      expected,
      "The binding tarball platform dependency matrix is invalid",
    );
    assert(entryNames.has("package/src-js/index.js"), "The binding loader is missing");
    assert(entryNames.has("package/src-js/index.d.ts"), "The binding declarations are missing");
    assert(
      !entries.some(({ name }) => name.endsWith(".node")),
      "The binding tarball must not contain a native binary",
    );
    return;
  }

  assert(
    manifest.name.startsWith("@imagemin-rs/binding-"),
    `Unexpected release package ${manifest.name}`,
  );
  const nativeEntries = entries.filter(({ name }) => name.endsWith(".node"));
  assert(nativeEntries.length === 1, `${manifest.name} must contain exactly one native binary`);
  assert(
    nativeEntries[0].name === `package/${manifest.main}`,
    `${manifest.name} main does not match its native binary`,
  );
  assert(nativeEntries[0].data.byteLength > 0, `${manifest.name} native binary is empty`);
}

function readTarEntries(archive) {
  const entries = [];
  let offset = 0;

  while (offset + 512 <= archive.byteLength) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;

    const name = readTarString(header, 0, 100);
    const prefix = readTarString(header, 345, 155);
    const fullName = prefix === "" ? name : `${prefix}/${name}`;
    const sizeText = readTarString(header, 124, 12).split("\0", 1)[0].trim();
    const size = sizeText === "" ? 0 : Number.parseInt(sizeText, 8);
    assert(Number.isSafeInteger(size) && size >= 0, `Invalid tar entry size for ${fullName}`);

    const dataOffset = offset + 512;
    const dataEnd = dataOffset + size;
    assert(dataEnd <= archive.byteLength, `Truncated tar entry ${fullName}`);
    entries.push({ data: archive.subarray(dataOffset, dataEnd), name: fullName });
    offset = dataOffset + Math.ceil(size / 512) * 512;
  }

  return entries;
}

function readTarString(header, offset, length) {
  const end = header.indexOf(0, offset);
  const boundedEnd = end === -1 || end > offset + length ? offset + length : end;
  return header.subarray(offset, boundedEnd).toString("utf8");
}

async function prepareEmptyOutputDirectory() {
  await mkdir(dirname(outputDirectory), { recursive: true });
  try {
    await access(outputDirectory);
    const entries = await readdir(outputDirectory);
    assert(
      entries.length === 0,
      `Refusing to overwrite non-empty release directory: ${outputDirectory}`,
    );
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    await mkdir(outputDirectory);
  }
}

function run(command, arguments_, options) {
  const executable = process.platform === "win32" ? `${command}.cmd` : command;
  return new Promise((resolvePromise, reject) => {
    const child = spawn(executable, arguments_, { ...options, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${command} failed with ${signal ?? `exit code ${code}`}`));
    });
  });
}

function readArgument(name) {
  const direct = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (direct !== undefined) return direct.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function currentPlatformDirectory() {
  assert(["arm64", "x64"].includes(process.arch), `Unsupported architecture: ${process.arch}`);
  if (process.platform === "darwin") return `darwin-${process.arch}`;
  if (process.platform === "win32") return `win32-${process.arch}-msvc`;
  if (process.platform === "linux") {
    const report = process.report?.getReport();
    const libc = report?.header?.glibcVersionRuntime === undefined ? "musl" : "gnu";
    return `linux-${process.arch}-${libc}`;
  }
  throw new Error(`Unsupported platform: ${process.platform}`);
}

function assertDeepEqual(actual, expected, message) {
  assert(JSON.stringify(sortObject(actual)) === JSON.stringify(sortObject(expected)), message);
}

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, sortObject(entry)]),
  );
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
