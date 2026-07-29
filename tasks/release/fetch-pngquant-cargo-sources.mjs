import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DOWNLOAD_ATTEMPTS = 3;
const DOWNLOAD_TIMEOUT_MILLISECONDS = 60_000;
const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;
const workspaceRoot = fileURLToPath(new URL("../../", import.meta.url));
const lockPath = resolve(
  workspaceRoot,
  readOptionalFlag("--lock") ?? "tasks/sidecars/pngquant.Cargo.lock",
);
const outputDirectory = resolve(workspaceRoot, readFlag("--output"));
const registryBase = readOptionalFlag("--registry-base") ?? "https://static.crates.io/crates";
const lockBody = await readFile(lockPath);
const packages = parseCratesIoPackages(lockBody.toString("utf8"));

assert(
  registryBase.startsWith("https://") || registryBase.startsWith("http://127.0.0.1:"),
  "Cargo source registry must use HTTPS",
);
assert(packages.length > 0, "The pngquant Cargo lockfile contains no registry sources");

await mkdir(outputDirectory, { recursive: true });
for (const descriptor of packages) {
  const archivePath = join(outputDirectory, descriptor.filename);
  if (!(await hasExpectedDigest(archivePath, descriptor.sha256))) {
    const body = await download(descriptor.url);
    const digest = createHash("sha256").update(body).digest("hex");
    assert(
      digest === descriptor.sha256,
      `${descriptor.filename} checksum mismatch: expected ${descriptor.sha256}, received ${digest}`,
    );
    await writeFile(archivePath, body);
  }
}

const manifest = {
  lockfile: {
    filename: basename(lockPath),
    sha256: createHash("sha256").update(lockBody).digest("hex"),
  },
  packages,
  schema: 1,
};
await writeFile(
  join(outputDirectory, "cargo-source-manifest.json"),
  `${JSON.stringify(manifest, undefined, 2)}\n`,
);

console.log(
  JSON.stringify(
    {
      lockfile: manifest.lockfile,
      packages: packages.length,
    },
    undefined,
    2,
  ),
);

function parseCratesIoPackages(lockfile) {
  const descriptors = lockfile
    .split(/^\[\[package\]\]\s*$/mu)
    .slice(1)
    .map((block) => ({
      checksum: readTomlString(block, "checksum"),
      name: readTomlString(block, "name"),
      source: readTomlString(block, "source"),
      version: readTomlString(block, "version"),
    }))
    .filter(({ source }) => source !== undefined)
    .map(({ checksum, name, source, version }) => {
      assert(
        source === "registry+https://github.com/rust-lang/crates.io-index",
        `Unsupported Cargo source for ${name ?? "unknown package"}: ${source}`,
      );
      assert(typeof name === "string" && name.length > 0, "Cargo package name is missing");
      assert(
        typeof version === "string" && /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u.test(version),
        `Cargo package ${name} has an invalid version`,
      );
      assert(
        typeof checksum === "string" && /^[\da-f]{64}$/u.test(checksum),
        `Cargo package ${name}@${version} has an invalid checksum`,
      );
      const filename = `${name}-${version}.crate`;
      return {
        filename,
        name,
        sha256: checksum,
        url: `${registryBase}/${encodeURIComponent(name)}/${encodeURIComponent(filename)}`,
        version,
      };
    })
    .sort((left, right) => left.filename.localeCompare(right.filename));

  assert(
    new Set(descriptors.map(({ filename }) => filename)).size === descriptors.length,
    "Cargo source archive filenames are not unique",
  );
  return descriptors;
}

function readTomlString(block, key) {
  return block.match(new RegExp(`^${key} = "([^"]+)"$`, "mu"))?.[1];
}

async function download(url) {
  let lastError;

  for (let attempt = 1; attempt <= DOWNLOAD_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MILLISECONDS),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const declaredBytes = Number(response.headers.get("content-length"));
      if (Number.isFinite(declaredBytes) && declaredBytes > MAX_ARCHIVE_BYTES) {
        throw new Error(`archive exceeds the ${MAX_ARCHIVE_BYTES} byte limit`);
      }

      const body = Buffer.from(await response.arrayBuffer());
      if (body.byteLength > MAX_ARCHIVE_BYTES) {
        throw new Error(`archive exceeds the ${MAX_ARCHIVE_BYTES} byte limit`);
      }
      return body;
    } catch (error) {
      lastError = error;
      if (attempt < DOWNLOAD_ATTEMPTS) {
        await new Promise((resolvePromise) => setTimeout(resolvePromise, attempt * 250));
      }
    }
  }

  throw new Error(`Download failed for ${url} after ${DOWNLOAD_ATTEMPTS} attempts`, {
    cause: lastError,
  });
}

async function hasExpectedDigest(path, expected) {
  try {
    return (
      createHash("sha256")
        .update(await readFile(path))
        .digest("hex") === expected
    );
  } catch {
    return false;
  }
}

function readFlag(flag) {
  const value = readOptionalFlag(flag);
  if (value === undefined) {
    throw new TypeError(
      "Usage: node tasks/release/fetch-pngquant-cargo-sources.mjs --output <dir>",
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
