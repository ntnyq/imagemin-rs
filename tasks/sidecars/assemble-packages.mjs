import { createHash } from "node:crypto";
import { chmod, copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
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
    usesGplSources: true,
  },
  {
    artifact: "gifsicle",
    binaries: ["gifsicle"],
    licenses: ["gifsicle-COPYING"],
    packagePrefix: "sidecar-gifsicle",
    tool: "gifsicle",
    usesGplSources: true,
  },
];
const cliArguments = process.argv.slice(2);
const artifactsRoot = resolve(readFlag("--artifacts"));
const npmRoot = resolve(readFlag("--npm-dir"));
const gplSourcesRootFlag = readOptionalFlag("--gpl-sources");
const gplSourcesRoot = gplSourcesRootFlag === undefined ? undefined : resolve(gplSourcesRootFlag);
const gplSourceManifest =
  gplSourcesRoot === undefined
    ? undefined
    : JSON.parse(await readFile(join(gplSourcesRoot, "gpl-source-manifest.json"), "utf8"));
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
    const sourcePackage =
      sidecar.usesGplSources === true && gplSourceManifest !== undefined
        ? await prepareGplSourcePackage({
            packageManifest,
            packageRoot,
            sourceManifest: gplSourceManifest,
            sourceRoot: gplSourcesRoot,
            tool: sidecar.tool,
          })
        : undefined;
    pendingCopies.push({
      binaries: binaryCopies,
      licenses: licenseCopies,
      manifests: manifestCopies,
      packageRoot,
      sourcePackage,
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
  if (item.sourcePackage !== undefined) {
    const sourceRoot = join(item.packageRoot, "sources");
    await mkdir(sourceRoot, { recursive: true });
    for (const source of item.sourcePackage.copies) await copyFile(...source);
    await writeFile(
      join(sourceRoot, "source-manifest.json"),
      `${JSON.stringify(item.sourcePackage.manifest, undefined, 2)}\n`,
    );
    await writeFile(join(sourceRoot, "README.md"), item.sourcePackage.readme);
  }
}

console.log(
  JSON.stringify({ assembled: requestedTargets, tools: requestedToolNames }, undefined, 2),
);

function readFlag(flag) {
  const value = readOptionalFlag(flag);
  if (value === undefined) {
    throw new TypeError(
      "Usage: node tasks/sidecars/assemble-packages.mjs --artifacts <dir> --npm-dir <dir> --targets <target,...> [--tools <tool,...>] [--gpl-sources <dir>]",
    );
  }
  return value;
}

function readOptionalFlag(flag) {
  const index = cliArguments.indexOf(flag);
  const value = index === -1 ? undefined : cliArguments[index + 1];
  return value === undefined || value.startsWith("--") ? undefined : value;
}

async function prepareGplSourcePackage({
  packageManifest,
  packageRoot,
  sourceManifest,
  sourceRoot,
  tool,
}) {
  assert(sourceManifest.schema === 2, "GPL source manifest schema is invalid");
  assert(
    sourceManifest.version === packageManifest.version,
    `${packageManifest.name} and GPL source versions differ`,
  );
  assert(Array.isArray(sourceManifest.sources), "GPL source entries are missing");
  assert(Array.isArray(sourceManifest.materials), "GPL build materials are missing");
  const sources = sourceManifest.sources.filter((descriptor) => descriptor.tool === tool);
  const materials = sourceManifest.materials.filter(
    (descriptor) => Array.isArray(descriptor.tools) && descriptor.tools.includes(tool),
  );
  assert(sources.length > 0, `GPL sources for ${tool} are missing`);
  assert(materials.length > 0, `GPL build materials for ${tool} are missing`);

  const copies = [];
  for (const descriptor of [...sources, ...materials]) {
    assertSourceMaterialDescriptor(descriptor, tool);
    const inputPath = join(sourceRoot, descriptor.filename);
    const body = await readFile(inputPath);
    assert(
      createHash("sha256").update(body).digest("hex") === descriptor.sha256,
      `${descriptor.filename} differs from the GPL source manifest`,
    );
    copies.push([inputPath, join(packageRoot, "sources", descriptor.filename)]);
  }

  return {
    copies,
    manifest: {
      materials,
      package: packageManifest.name,
      schema: 1,
      sources,
      tool,
      version: packageManifest.version,
    },
    readme: `# Corresponding source materials

This directory accompanies the ${tool} executable in
\`${packageManifest.name}@${packageManifest.version}\`.

\`source-manifest.json\` records the SHA-256 of every source and build-material
file. \`sidecar-build-scripts.tar\` preserves the exact repository paths,
scripts, pins, lockfile, and platform configuration used by the release.
${
  tool === "pngquant"
    ? "\n`pngquant-cargo-sources.tar` contains every registry source archive in the pinned Cargo lockfile, including target-specific entries.\n"
    : ""
}
The matching immutable Git tag and GitHub Release provide duplicate copies and
the release-wide manifest. These materials remain under their respective
upstream licenses.
`,
  };
}

function assertSourceMaterialDescriptor(descriptor, tool) {
  assert(
    descriptor !== null &&
      typeof descriptor === "object" &&
      typeof descriptor.filename === "string" &&
      /^[0-9A-Za-z_.+-]+$/u.test(descriptor.filename) &&
      typeof descriptor.sha256 === "string" &&
      /^[\da-f]{64}$/u.test(descriptor.sha256),
    `GPL source descriptor for ${tool} is invalid`,
  );
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
