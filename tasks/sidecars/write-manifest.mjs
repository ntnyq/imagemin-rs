import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const supportedTargets = new Set([
  "darwin-arm64",
  "darwin-x64",
  "linux-arm64-gnu",
  "linux-arm64-musl",
  "linux-x64-gnu",
  "linux-x64-musl",
  "win32-arm64-msvc",
  "win32-x64-msvc",
]);
const cliArguments = process.argv.slice(2);
const tool = readFlag("--tool");
const target = readFlag("--target");
const binaryPath = resolve(readFlag("--binary"));
const outputPath = resolve(readFlag("--output"));

if (!supportedTargets.has(target)) {
  throw new TypeError(`Unsupported sidecar target: ${target}`);
}

const pinsPath = fileURLToPath(new URL("pins.json", import.meta.url));
const pins = JSON.parse(await readFile(pinsPath, "utf8"));
const toolPins = pins[tool];
if (toolPins === undefined) {
  throw new TypeError(
    `Unknown sidecar tool ${tool}; expected one of ${Object.keys(pins).join(", ")}`,
  );
}

const binary = await readFile(binaryPath);
if (binary.byteLength === 0) {
  throw new Error(`Sidecar binary is empty: ${binaryPath}`);
}

const sources = Object.fromEntries(
  Object.entries(toolPins.sources)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, source]) => [
      name,
      {
        sha256: source.sha256,
        url: source.url,
        version: source.version,
      },
    ]),
);
const manifest = {
  binary: basename(binaryPath),
  bytes: binary.byteLength,
  schema: 1,
  sha256: createHash("sha256").update(binary).digest("hex"),
  sources,
  target,
  tool,
  version: toolPins.version,
};

await writeFile(outputPath, `${JSON.stringify(manifest, undefined, 2)}\n`);

function readFlag(flag) {
  const index = cliArguments.indexOf(flag);
  const value = index === -1 ? undefined : cliArguments[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new TypeError(
      "Usage: node tasks/sidecars/write-manifest.mjs --tool <name> --target <target> --binary <path> --output <path>",
    );
  }
  return value;
}
