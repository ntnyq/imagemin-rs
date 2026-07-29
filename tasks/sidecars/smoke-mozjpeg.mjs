import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runBinary } from "./run-binary.mjs";

const workspaceRoot = fileURLToPath(new URL("../../", import.meta.url));
const cjpeg = resolve(readFlag("--cjpeg"));
const jpegtran = resolve(readFlag("--jpegtran"));
const fixture = Buffer.from(
  (await readFile(resolve(workspaceRoot, "fixtures/jpeg/color-metadata.hex"), "utf8")).replaceAll(
    /\s+/gu,
    "",
  ),
  "hex",
);

for (const binary of [cjpeg, jpegtran]) {
  const version = await runBinary(binary, ["-version"], Buffer.alloc(0));
  assert.match(`${version.stdout}${version.stderr}`, /version 4\.1\.1/u);
}

const encoded = await runBinary(cjpeg, ["-quality", "75"], fixture);
assertJpeg(encoded.stdout);

const transformed = await runBinary(jpegtran, ["-copy", "none", "-optimize"], encoded.stdout);
assertJpeg(transformed.stdout);

console.log(
  JSON.stringify(
    {
      cjpegBytes: encoded.stdout.byteLength,
      jpegtranBytes: transformed.stdout.byteLength,
      version: "4.1.1",
    },
    undefined,
    2,
  ),
);

function assertJpeg(output) {
  assert.equal(output[0], 0xff);
  assert.equal(output[1], 0xd8);
  assert.equal(output.at(-2), 0xff);
  assert.equal(output.at(-1), 0xd9);
}

function readFlag(flag) {
  const index = process.argv.indexOf(flag);
  const value = index === -1 ? undefined : process.argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new TypeError(
      "Usage: node tasks/sidecars/smoke-mozjpeg.mjs --cjpeg <path> --jpegtran <path>",
    );
  }
  return value;
}
