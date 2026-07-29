import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const cliArguments = process.argv.slice(2);
const tool = readFlag("--tool");
const source = readOptionalFlag("--source");
const pinsPath = fileURLToPath(new URL("pins.json", import.meta.url));
const pins = JSON.parse(await readFile(pinsPath, "utf8"));
const toolPins = pins[tool];

if (toolPins === undefined) {
  throw new TypeError(`Unknown pinned tool: ${tool}`);
}

const version = source === undefined ? toolPins.version : toolPins.sources?.[source]?.version;
if (version === undefined) {
  throw new TypeError(`Unknown pinned source: ${tool}.sources.${source}`);
}

console.log(version);

function readFlag(flag) {
  const value = readOptionalFlag(flag);
  if (value === undefined) {
    throw new TypeError("Usage: node tasks/sidecars/read-pin.mjs --tool <name> [--source <name>]");
  }
  return value;
}

function readOptionalFlag(flag) {
  const index = cliArguments.indexOf(flag);
  const value = index === -1 ? undefined : cliArguments[index + 1];
  return value === undefined || value.startsWith("--") ? undefined : value;
}
