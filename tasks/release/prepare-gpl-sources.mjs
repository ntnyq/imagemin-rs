import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = fileURLToPath(new URL("../../", import.meta.url));
const sourcesDirectory = resolve(workspaceRoot, readFlag("--sources"));
const outputDirectory = resolve(workspaceRoot, readFlag("--output"));
const pinsPath = resolve(workspaceRoot, readOptionalFlag("--pins") ?? "tasks/sidecars/pins.json");
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
  schema: 1,
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
      sources: sourceEntries.length,
      version,
    },
    undefined,
    2,
  ),
);

function assetNames() {
  return ["gpl-source-manifest.json", "GPL-SOURCE-README.md"];
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
verification logic are preserved in the matching repository tag:

- ${repositoryRoot}/tasks/sidecars/build-gifsicle.sh
- ${repositoryRoot}/tasks/sidecars/gifsicle-msvc/CMakeLists.txt
- ${repositoryRoot}/tasks/sidecars/build-pngquant.sh
- ${repositoryRoot}/tasks/sidecars/pngquant.Cargo.lock
- ${repositoryRoot}/tasks/sidecars/pins.json

The source archives remain under their upstream licenses. This release asset
does not change those terms. The project maintainer remains responsible for
confirming the complete corresponding-source and notice obligations that apply
to distribution.
`;
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
      "Usage: node tasks/release/prepare-gpl-sources.mjs --sources <dir> --output <dir>",
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
