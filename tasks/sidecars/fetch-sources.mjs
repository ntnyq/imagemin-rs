import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DOWNLOAD_ATTEMPTS = 3;
const DOWNLOAD_TIMEOUT_MILLISECONDS = 60_000;
const MAX_ARCHIVE_BYTES = 128 * 1024 * 1024;
const cliArguments = process.argv.slice(2);
const tool = readFlag("--tool");
const outputDirectory = resolve(readFlag("--output"));
const pinsPath = resolve(
  readOptionalFlag("--pins") ?? fileURLToPath(new URL("pins.json", import.meta.url)),
);
const pins = JSON.parse(await readFile(pinsPath, "utf8"));
const toolPins = pins[tool];
if (toolPins === undefined) {
  throw new Error(`Unknown sidecar tool ${tool}; expected one of ${Object.keys(pins).join(", ")}`);
}

await mkdir(outputDirectory, { recursive: true });
for (const [name, source] of Object.entries(toolPins.sources)) {
  const archivePath = join(outputDirectory, `${name}-${source.version}.tar.gz`);
  if (await hasExpectedDigest(archivePath, source.sha256)) {
    console.log(`${name} ${source.version} already present`);
    continue;
  }

  const body = await download(source.url);
  const digest = createHash("sha256").update(body).digest("hex");
  if (digest !== source.sha256) {
    throw new Error(
      `Checksum mismatch for ${name} ${source.version}: expected ${source.sha256}, downloaded ${digest}`,
    );
  }
  await writeFile(archivePath, body);
  console.log(`${name} ${source.version} downloaded (${body.length} bytes)`);
}

async function download(url) {
  let lastError;

  for (let attempt = 1; attempt <= DOWNLOAD_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MILLISECONDS),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

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
    const existing = await readFile(path);
    return createHash("sha256").update(existing).digest("hex") === expected;
  } catch {
    return false;
  }
}

function readFlag(flag) {
  const value = readOptionalFlag(flag);
  if (value === undefined) {
    throw new TypeError(
      "Usage: node tasks/sidecars/fetch-sources.mjs --tool <name> --output <dir>",
    );
  }
  return value;
}

function readOptionalFlag(flag) {
  const index = cliArguments.indexOf(flag);
  const value = index === -1 ? undefined : cliArguments[index + 1];
  return value === undefined || value.startsWith("--") ? undefined : value;
}
