import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";

const workspaceRoot = new URL("../../", import.meta.url);
const platforms = [
  { cpu: "arm64", directory: "darwin-arm64", os: "darwin" },
  { cpu: "x64", directory: "darwin-x64", os: "darwin" },
  { cpu: "arm64", directory: "linux-arm64-gnu", libc: "glibc", os: "linux" },
  { cpu: "arm64", directory: "linux-arm64-musl", libc: "musl", os: "linux" },
  { cpu: "x64", directory: "linux-x64-gnu", libc: "glibc", os: "linux" },
  { cpu: "x64", directory: "linux-x64-musl", libc: "musl", os: "linux" },
  { cpu: "arm64", directory: "win32-arm64-msvc", os: "win32" },
  { cpu: "x64", directory: "win32-x64-msvc", os: "win32" },
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
const sidecarTools = [
  { binary: "cjpeg", provenance: "mozjpeg" },
  { binary: "cwebp", provenance: "cwebp" },
  { binary: "jpegtran", provenance: "mozjpeg" },
];
const pngquantLicenseFiles = ["libimagequant-COPYRIGHT", "pngquant-COPYRIGHT"];

const artifactMode = readArgument("--artifacts") ?? "current";
if (!["all", "current", "none"].includes(artifactMode)) {
  throw new TypeError("--artifacts must be all, current, or none");
}

const publicManifest = await readJson("packages/imagemin/package.json");
const bindingManifest = await readJson("napi/imagemin/package.json");
const sidecarPins = await readJson("tasks/sidecars/pins.json");
const rootManifest = await readJson("package.json");
const cargoManifest = await readText("Cargo.toml");
const version = publicManifest.version;
assert(
  typeof version === "string" && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version),
  "Invalid public package version",
);
if (process.argv.includes("--release")) {
  assert(version !== "0.0.0", "Release packages cannot use the 0.0.0 development version");
}

const cargoVersion = cargoManifest.match(
  /\[workspace\.package\][\s\S]*?\nversion = "([^"]+)"/,
)?.[1];
assert(
  cargoVersion === version,
  `Cargo workspace version ${cargoVersion} does not match ${version}`,
);
assert(
  bindingManifest.version === version,
  "Binding package version does not match the public package",
);
assert(rootManifest.version === version, "Root package version does not match the public package");
assert(bindingManifest.engines?.node === publicManifest.engines?.node, "Node engine ranges differ");
const expectedPublicOptionalDependencies = {
  "@imagemin-rs/binding": "workspace:*",
  ...Object.fromEntries(
    platforms.map(({ directory }) => [`@imagemin-rs/sidecar-pngquant-${directory}`, "workspace:*"]),
  ),
  ...Object.fromEntries(
    platforms.map(({ directory }) => [`@imagemin-rs/sidecars-${directory}`, "workspace:*"]),
  ),
};
assertDeepEqual(
  publicManifest.optionalDependencies,
  expectedPublicOptionalDependencies,
  "Public package optional dependency matrix is incomplete",
);

const expectedOptionalDependencies = Object.fromEntries(
  platforms.map(({ directory }) => [`@imagemin-rs/binding-${directory}`, "workspace:*"]),
);
assertDeepEqual(
  bindingManifest.optionalDependencies,
  expectedOptionalDependencies,
  "Binding optional dependency matrix is incomplete",
);

const loader = await readText("napi/imagemin/src-js/index.js");
const loaderVersions = new Set(
  [...loader.matchAll(/expected ([0-9A-Za-z.-]+) but got/gu)].map((match) => match[1]),
);
assertDeepEqual(
  [...loaderVersions],
  [version],
  "Generated binding loader version does not match the packages",
);
const artifacts = [];
const requiredDirectories =
  artifactMode === "all"
    ? new Set(platforms.map(({ directory }) => directory))
    : artifactMode === "current"
      ? new Set([currentPlatformDirectory()])
      : new Set();

for (const platform of platforms) {
  const packageName = `@imagemin-rs/binding-${platform.directory}`;
  const binaryName = `imagemin_rs.${platform.directory}.node`;
  const packageRoot = `npm/${platform.directory}`;
  const manifest = await readJson(`${packageRoot}/package.json`);

  assert(manifest.name === packageName, `Unexpected package name for ${platform.directory}`);
  assert(manifest.version === version, `${packageName} version does not match ${version}`);
  assert(manifest.main === binaryName, `${packageName} main does not name its binary`);
  assert(manifest.publishConfig?.access === "public", `${packageName} is not publicly publishable`);
  assertDeepEqual(manifest.cpu, [platform.cpu], `${packageName} CPU constraint is invalid`);
  assertDeepEqual(manifest.os, [platform.os], `${packageName} OS constraint is invalid`);
  assertDeepEqual(
    manifest.libc,
    platform.libc === undefined ? undefined : [platform.libc],
    `${packageName} libc constraint is invalid`,
  );
  assertDeepEqual(
    manifest.files,
    ["LICENSE", "README.md", binaryName],
    `${packageName} files allowlist is invalid`,
  );
  assert(
    manifest.engines?.node === publicManifest.engines.node,
    `${packageName} Node engine differs`,
  );
  assert(loader.includes(`'${packageName}'`), `Generated loader does not reference ${packageName}`);
  assert(
    (await readText(`${packageRoot}/LICENSE`)).includes("MIT License"),
    `${packageName} has no license text`,
  );
  assert(
    (await readText(`${packageRoot}/README.md`)).includes(packageName),
    `${packageName} has no package README`,
  );

  if (requiredDirectories.has(platform.directory)) {
    const binaryUrl = new URL(`${packageRoot}/${binaryName}`, workspaceRoot);
    const binary = await readFile(binaryUrl);
    const metadata = await stat(binaryUrl);
    assert(metadata.isFile() && binary.byteLength > 0, `${packageName} native binary is empty`);
    assertBinaryMagic(binary, platform.os, packageName);
    artifacts.push({
      bytes: binary.byteLength,
      package: packageName,
      sha256: createHash("sha256").update(binary).digest("hex"),
    });
  }

  const sidecarPackageName = `@imagemin-rs/sidecars-${platform.directory}`;
  const sidecarBinaries = sidecarTools.map(({ binary, provenance }) => ({
    binary,
    file: platform.os === "win32" ? `${binary}.exe` : binary,
    provenance,
  }));
  const sidecarRoot = `npm/sidecars-${platform.directory}`;
  const sidecarManifest = await readJson(`${sidecarRoot}/package.json`);
  assert(
    sidecarManifest.name === sidecarPackageName,
    `Unexpected sidecar package name for ${platform.directory}`,
  );
  assert(
    sidecarManifest.version === version,
    `${sidecarPackageName} version does not match ${version}`,
  );
  assert(
    sidecarManifest.publishConfig?.access === "public",
    `${sidecarPackageName} is not publicly publishable`,
  );
  assertDeepEqual(
    sidecarManifest.cpu,
    [platform.cpu],
    `${sidecarPackageName} CPU constraint is invalid`,
  );
  assertDeepEqual(
    sidecarManifest.os,
    [platform.os],
    `${sidecarPackageName} OS constraint is invalid`,
  );
  assertDeepEqual(
    sidecarManifest.libc,
    platform.libc === undefined ? undefined : [platform.libc],
    `${sidecarPackageName} libc constraint is invalid`,
  );
  assertDeepEqual(
    sidecarManifest.files,
    [
      "README.md",
      ...sidecarBinaries.flatMap(({ binary, file }) => [file, `${binary}.manifest.json`]),
      "licenses",
    ],
    `${sidecarPackageName} files allowlist is invalid`,
  );
  assertDeepEqual(
    sidecarManifest.bin,
    Object.fromEntries(sidecarBinaries.map(({ binary, file }) => [binary, file])),
    `${sidecarPackageName} bin mapping is invalid`,
  );
  assert(
    sidecarManifest.engines?.node === publicManifest.engines.node,
    `${sidecarPackageName} Node engine differs`,
  );
  assert(
    (await readText(`${sidecarRoot}/README.md`)).includes(sidecarPackageName),
    `${sidecarPackageName} has no package README`,
  );

  if (requiredDirectories.has(platform.directory)) {
    for (const sidecar of sidecarBinaries) {
      const binaryUrl = new URL(`${sidecarRoot}/${sidecar.file}`, workspaceRoot);
      const binary = await readFile(binaryUrl);
      const metadata = await stat(binaryUrl);
      assert(
        metadata.isFile() && binary.byteLength > 0,
        `${sidecarPackageName} ${sidecar.binary} is empty`,
      );
      if (platform.os !== "win32") {
        assert(
          (metadata.mode & 0o111) !== 0,
          `${sidecarPackageName} ${sidecar.binary} is not marked executable`,
        );
      }
      assertBinaryMagic(binary, platform.os, sidecarPackageName);

      const provenance = await readJson(`${sidecarRoot}/${sidecar.binary}.manifest.json`);
      const expectedSources = Object.fromEntries(
        Object.entries(sidecarPins[sidecar.provenance].sources).sort(([left], [right]) =>
          left.localeCompare(right),
        ),
      );
      assertDeepEqual(
        provenance,
        {
          binary: sidecar.file,
          bytes: binary.byteLength,
          schema: 1,
          sha256: createHash("sha256").update(binary).digest("hex"),
          sources: expectedSources,
          target: platform.directory,
          tool: sidecar.provenance,
          version: sidecarPins[sidecar.provenance].version,
        },
        `${sidecarPackageName} ${sidecar.binary} provenance manifest is invalid`,
      );
      artifacts.push({
        bytes: binary.byteLength,
        package: sidecarPackageName,
        sha256: provenance.sha256,
        tool: sidecar.binary,
      });
    }
    for (const licenseFile of sidecarLicenseFiles) {
      const license = await stat(new URL(`${sidecarRoot}/licenses/${licenseFile}`, workspaceRoot));
      assert(
        license.isFile() && license.size > 0,
        `${sidecarPackageName} is missing ${licenseFile}`,
      );
    }
  }

  const pngquantPackageName = `@imagemin-rs/sidecar-pngquant-${platform.directory}`;
  const pngquantBinaryName = platform.os === "win32" ? "pngquant.exe" : "pngquant";
  const pngquantRoot = `npm/sidecar-pngquant-${platform.directory}`;
  const pngquantManifest = await readJson(`${pngquantRoot}/package.json`);
  assert(
    pngquantManifest.name === pngquantPackageName,
    `Unexpected pngquant package name for ${platform.directory}`,
  );
  assert(
    pngquantManifest.version === version,
    `${pngquantPackageName} version does not match ${version}`,
  );
  assert(
    pngquantManifest.license === "GPL-3.0-or-later",
    `${pngquantPackageName} license is invalid`,
  );
  assert(
    pngquantManifest.publishConfig?.access === "public",
    `${pngquantPackageName} is not publicly publishable`,
  );
  assertDeepEqual(
    pngquantManifest.cpu,
    [platform.cpu],
    `${pngquantPackageName} CPU constraint is invalid`,
  );
  assertDeepEqual(
    pngquantManifest.os,
    [platform.os],
    `${pngquantPackageName} OS constraint is invalid`,
  );
  assertDeepEqual(
    pngquantManifest.libc,
    platform.libc === undefined ? undefined : [platform.libc],
    `${pngquantPackageName} libc constraint is invalid`,
  );
  assertDeepEqual(
    pngquantManifest.files,
    ["README.md", pngquantBinaryName, "pngquant.manifest.json", "licenses"],
    `${pngquantPackageName} files allowlist is invalid`,
  );
  assertDeepEqual(
    pngquantManifest.bin,
    { pngquant: pngquantBinaryName },
    `${pngquantPackageName} bin mapping is invalid`,
  );
  assert(
    pngquantManifest.engines?.node === publicManifest.engines.node,
    `${pngquantPackageName} Node engine differs`,
  );
  assert(
    (await readText(`${pngquantRoot}/README.md`)).includes(pngquantPackageName),
    `${pngquantPackageName} has no package README`,
  );

  if (requiredDirectories.has(platform.directory)) {
    const binaryUrl = new URL(`${pngquantRoot}/${pngquantBinaryName}`, workspaceRoot);
    const binary = await readFile(binaryUrl);
    const metadata = await stat(binaryUrl);
    assert(metadata.isFile() && binary.byteLength > 0, `${pngquantPackageName} is empty`);
    if (platform.os !== "win32") {
      assert((metadata.mode & 0o111) !== 0, `${pngquantPackageName} is not marked executable`);
    }
    assertBinaryMagic(binary, platform.os, pngquantPackageName);

    const provenance = await readJson(`${pngquantRoot}/pngquant.manifest.json`);
    const expectedSources = Object.fromEntries(
      Object.entries(sidecarPins.pngquant.sources).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    );
    assertDeepEqual(
      provenance,
      {
        binary: pngquantBinaryName,
        bytes: binary.byteLength,
        schema: 1,
        sha256: createHash("sha256").update(binary).digest("hex"),
        sources: expectedSources,
        target: platform.directory,
        tool: "pngquant",
        version: sidecarPins.pngquant.version,
      },
      `${pngquantPackageName} provenance manifest is invalid`,
    );
    for (const licenseFile of pngquantLicenseFiles) {
      const license = await stat(new URL(`${pngquantRoot}/licenses/${licenseFile}`, workspaceRoot));
      assert(
        license.isFile() && license.size > 0,
        `${pngquantPackageName} is missing ${licenseFile}`,
      );
    }
    artifacts.push({
      bytes: binary.byteLength,
      package: pngquantPackageName,
      sha256: provenance.sha256,
      tool: "pngquant",
    });
  }
}

for (const path of [
  "packages/imagemin/dist/index.mjs",
  "packages/imagemin/dist/index.d.mts",
  "packages/imagemin/LICENSE",
  "packages/imagemin/README.md",
  "packages/imagemin/THIRD_PARTY_NOTICES.md",
  "napi/imagemin/src-js/index.js",
  "napi/imagemin/src-js/index.d.ts",
  "napi/imagemin/LICENSE",
  "napi/imagemin/README.md",
]) {
  const metadata = await stat(new URL(path, workspaceRoot));
  assert(metadata.isFile() && metadata.size > 0, `Required release file is missing: ${path}`);
}

console.log(
  JSON.stringify(
    {
      artifactMode,
      artifacts,
      packages: 2 + platforms.length * 3,
      version,
    },
    undefined,
    2,
  ),
);

function readArgument(name) {
  const direct = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (direct !== undefined) return direct.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function currentPlatformDirectory() {
  if (!["arm64", "x64"].includes(process.arch)) {
    throw new Error(`Unsupported release architecture: ${process.arch}`);
  }
  if (process.platform === "darwin") return `darwin-${process.arch}`;
  if (process.platform === "win32") return `win32-${process.arch}-msvc`;
  if (process.platform === "linux") {
    const report = process.report?.getReport();
    const libc = report?.header?.glibcVersionRuntime === undefined ? "musl" : "gnu";
    return `linux-${process.arch}-${libc}`;
  }
  throw new Error(`Unsupported release platform: ${process.platform}`);
}

function assertBinaryMagic(binary, os, packageName) {
  const prefix = binary.subarray(0, 4).toString("hex");
  if (os === "linux") assert(prefix === "7f454c46", `${packageName} is not an ELF binary`);
  else if (os === "win32")
    assert(binary.subarray(0, 2).toString("ascii") === "MZ", `${packageName} is not a PE binary`);
  else {
    assert(
      ["cafebabe", "cffaedfe", "feedfacf"].includes(prefix),
      `${packageName} is not a Mach-O binary`,
    );
  }
}

function assertDeepEqual(actual, expected, message) {
  assert(JSON.stringify(actual) === JSON.stringify(expected), message);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function readJson(path) {
  return JSON.parse(await readText(path));
}

async function readText(path) {
  return readFile(new URL(path, workspaceRoot), "utf8");
}
