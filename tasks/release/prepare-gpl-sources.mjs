import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = fileURLToPath(new URL("../../", import.meta.url));
const sourcesDirectory = resolve(workspaceRoot, readFlag("--sources"));
const cargoSourcesDirectory = resolve(workspaceRoot, readFlag("--cargo-sources"));
const outputDirectory = resolve(workspaceRoot, readFlag("--output"));
const pinsPath = resolve(workspaceRoot, readOptionalFlag("--pins") ?? "tasks/sidecars/pins.json");
const cargoLockPath = resolve(
  workspaceRoot,
  readOptionalFlag("--cargo-lock") ?? "tasks/sidecars/pngquant.Cargo.lock",
);
const packagePath = resolve(
  workspaceRoot,
  readOptionalFlag("--package") ?? "packages/imagemin/package.json",
);

const pins = JSON.parse(await readFile(pinsPath, "utf8"));
const packageManifest = JSON.parse(await readFile(packagePath, "utf8"));
const version = packageManifest.version;
assert(
  typeof version === "string" && version !== "0.0.0",
  "GPL source assets require a release version",
);

await prepareEmptyDirectory(outputDirectory);

const sourceEntries = [];
for (const tool of ["gifsicle", "pngquant"]) {
  const toolPins = pins[tool];
  assert(toolPins !== undefined, `Missing ${tool} source pins`);

  for (const [name, source] of Object.entries(toolPins.sources).sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    assertSourceDescriptor(tool, name, source);
    const filename = `${name}-${source.version}.tar.gz`;
    const inputPath = join(sourcesDirectory, filename);
    const body = await readFile(inputPath);
    const digest = createHash("sha256").update(body).digest("hex");
    assert(
      digest === source.sha256,
      `${filename} checksum mismatch: expected ${source.sha256}, received ${digest}`,
    );
    await copyFile(inputPath, join(outputDirectory, filename));
    sourceEntries.push({
      filename,
      name,
      sha256: digest,
      tool,
      url: source.url,
      version: source.version,
    });
  }
}

const manifest = {
  materials: await prepareBuildMaterials(),
  schema: 2,
  sources: sourceEntries,
  version,
};
await writeFile(
  join(outputDirectory, "gpl-source-manifest.json"),
  `${JSON.stringify(manifest, undefined, 2)}\n`,
);
await writeFile(
  join(outputDirectory, "GPL-SOURCE-README.md"),
  createReadme(version, sourceEntries),
);

console.log(
  JSON.stringify(
    {
      files: [...sourceEntries.map(({ filename }) => filename), ...assetNames()],
      materials: manifest.materials.length,
      sources: sourceEntries.length,
      version,
    },
    undefined,
    2,
  ),
);

function assetNames() {
  return [
    "pngquant-cargo-sources.tar",
    "sidecar-build-scripts.tar",
    "gpl-source-manifest.json",
    "GPL-SOURCE-README.md",
  ];
}

function assertSourceDescriptor(tool, name, source) {
  assert(
    source !== null &&
      typeof source === "object" &&
      typeof source.sha256 === "string" &&
      /^[a-f0-9]{64}$/u.test(source.sha256) &&
      typeof source.url === "string" &&
      source.url.startsWith("https://") &&
      typeof source.version === "string" &&
      source.version.length > 0,
    `Invalid source pin ${tool}.${name}`,
  );
}

function createReadme(releaseVersion, entries) {
  const rows = entries
    .map(
      ({ filename, name, sha256, tool, url, version: sourceVersion }) =>
        `| ${tool} | ${name} | ${sourceVersion} | \`${filename}\` | \`${sha256}\` | ${url} |`,
    )
    .join("\n");
  const tag = `v${releaseVersion}`;
  const repositoryRoot = `https://github.com/ntnyq/imagemin-rs/blob/${tag}`;

  return `# GPL source inputs for ${tag}

These verified archives are the exact upstream source inputs used to build the
GPL sidecar executables distributed with imagemin-rs ${releaseVersion}.

| Tool | Component | Version | Asset | SHA-256 | Upstream |
| ---- | --------- | ------- | ----- | ------- | -------- |
${rows}

The build scripts, pinned Cargo lockfile, platform configuration, and package
verification logic are preserved both in \`sidecar-build-scripts.tar\` and the
matching repository tag:

- ${repositoryRoot}/tasks/sidecars/build-gifsicle.sh
- ${repositoryRoot}/tasks/sidecars/gifsicle-msvc/CMakeLists.txt
- ${repositoryRoot}/tasks/sidecars/build-pngquant.sh
- ${repositoryRoot}/tasks/sidecars/pngquant.Cargo.lock
- ${repositoryRoot}/tasks/sidecars/pins.json

\`pngquant-cargo-sources.tar\` contains the exact \`.crate\` archives for every
registry package in \`pngquant.Cargo.lock\`, not only the packages selected on
the machine that prepared this release. Its nested manifest records every
Cargo checksum and the lockfile checksum.

The source archives remain under their upstream licenses. This release asset
does not change those terms. The project maintainer remains responsible for
confirming the complete corresponding-source and notice obligations that apply
to distribution.
`;
}

async function prepareBuildMaterials() {
  const cargoManifestPath = join(cargoSourcesDirectory, "cargo-source-manifest.json");
  const cargoManifestBody = await readFile(cargoManifestPath);
  const cargoManifest = JSON.parse(cargoManifestBody.toString("utf8"));
  const cargoLockBody = await readFile(cargoLockPath);
  assert(cargoManifest.schema === 1, "Cargo source manifest schema is invalid");
  assert(
    cargoManifest.lockfile?.sha256 === sha256(cargoLockBody),
    "Cargo source manifest does not match pngquant.Cargo.lock",
  );
  assert(
    Array.isArray(cargoManifest.packages) && cargoManifest.packages.length > 0,
    "Cargo source manifest contains no packages",
  );

  const cargoEntries = [
    { body: cargoManifestBody, name: "cargo-source-manifest.json" },
    { body: cargoLockBody, name: "pngquant.Cargo.lock" },
  ];
  for (const descriptor of cargoManifest.packages) {
    assertCargoSourceDescriptor(descriptor);
    const body = await readFile(join(cargoSourcesDirectory, descriptor.filename));
    assert(
      sha256(body) === descriptor.sha256,
      `${descriptor.filename} differs from its Cargo checksum`,
    );
    cargoEntries.push({ body, name: `crates/${descriptor.filename}` });
  }

  const cargoArchive = createTarArchive(cargoEntries);
  const buildArchive = createTarArchive(
    await Promise.all(
      [
        ["tasks/sidecars/build-gifsicle.sh", 0o755],
        ["tasks/sidecars/build-pngquant.sh", 0o755],
        ["tasks/sidecars/gifsicle-msvc/CMakeLists.txt", 0o644],
        ["tasks/sidecars/pins.json", 0o644],
        ["tasks/sidecars/pngquant.Cargo.lock", 0o644],
        ["tasks/sidecars/read-pin.mjs", 0o644],
        ["tasks/sidecars/write-manifest.mjs", 0o644],
      ].map(async ([name, mode]) => ({
        body: await readFile(resolve(workspaceRoot, name)),
        mode,
        name,
      })),
    ),
  );
  const materials = [
    materialDescriptor("pngquant-cargo-sources.tar", cargoArchive, ["pngquant"], {
      lockfileSha256: cargoManifest.lockfile.sha256,
      packages: cargoManifest.packages.length,
    }),
    materialDescriptor("sidecar-build-scripts.tar", buildArchive, ["gifsicle", "pngquant"]),
  ];
  await Promise.all(
    materials.map(({ filename }, index) =>
      writeFile(join(outputDirectory, filename), index === 0 ? cargoArchive : buildArchive),
    ),
  );
  return materials;
}

function assertCargoSourceDescriptor(descriptor) {
  assert(
    descriptor !== null &&
      typeof descriptor === "object" &&
      typeof descriptor.filename === "string" &&
      /^[0-9A-Za-z_.+-]+\.crate$/u.test(descriptor.filename) &&
      typeof descriptor.name === "string" &&
      typeof descriptor.version === "string" &&
      typeof descriptor.sha256 === "string" &&
      /^[\da-f]{64}$/u.test(descriptor.sha256),
    "Cargo source manifest contains an invalid package",
  );
}

function materialDescriptor(filename, body, tools, extra = {}) {
  return {
    bytes: body.byteLength,
    filename,
    sha256: sha256(body),
    tools,
    ...extra,
  };
}

function createTarArchive(entries) {
  const chunks = [];
  for (const entry of entries.toSorted((left, right) => left.name.localeCompare(right.name))) {
    const body = Buffer.from(entry.body);
    const header = Buffer.alloc(512);
    assert(Buffer.byteLength(entry.name) <= 100, `Tar path is too long: ${entry.name}`);
    header.write(entry.name, 0, 100, "utf8");
    writeTarOctal(header, 100, 8, entry.mode ?? 0o644);
    writeTarOctal(header, 108, 8, 0);
    writeTarOctal(header, 116, 8, 0);
    writeTarOctal(header, 124, 12, body.byteLength);
    writeTarOctal(header, 136, 12, 0);
    header.fill(0x20, 148, 156);
    header[156] = "0".charCodeAt(0);
    header.write("ustar\0", 257, 6, "ascii");
    header.write("00", 263, 2, "ascii");
    writeTarOctal(
      header,
      148,
      8,
      header.reduce((sum, byte) => sum + byte, 0),
    );
    chunks.push(header, body);
    const padding = (512 - (body.byteLength % 512)) % 512;
    if (padding > 0) chunks.push(Buffer.alloc(padding));
  }
  chunks.push(Buffer.alloc(1024));
  return Buffer.concat(chunks);
}

function writeTarOctal(header, offset, length, value) {
  const octal = value.toString(8);
  assert(octal.length < length, `Tar numeric field is too large: ${value}`);
  header.write(`${octal.padStart(length - 1, "0")}\0`, offset, length, "ascii");
}

function sha256(body) {
  return createHash("sha256").update(body).digest("hex");
}

async function prepareEmptyDirectory(path) {
  await mkdir(path, { recursive: true });
  const entries = await readdir(path);
  assert(entries.length === 0, `Refusing to overwrite non-empty directory: ${path}`);
}

function readFlag(flag) {
  const value = readOptionalFlag(flag);
  if (value === undefined) {
    throw new TypeError(
      "Usage: node tasks/release/prepare-gpl-sources.mjs --sources <dir> --cargo-sources <dir> --output <dir>",
    );
  }
  return value;
}

function readOptionalFlag(flag) {
  const direct = process.argv.find((argument) => argument.startsWith(`${flag}=`));
  if (direct !== undefined) return direct.slice(flag.length + 1);
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
