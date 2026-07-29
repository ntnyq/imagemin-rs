import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const workspaceRoot = fileURLToPath(new URL("../../", import.meta.url));
const binary = resolve(readFlag("--binary"));
const fixtures = [
  ["png", "fixtures/png/pngquant-rgba.hex"],
  ["jpeg", "fixtures/jpeg/color-metadata.hex"],
  ["tiff", "fixtures/webp/rgb-tiff.hex"],
];
const version = await execFileAsync(binary, ["-version"]);
assert.match(`${version.stdout}${version.stderr}`, /^1\.6\.0(?:\s|$)/u);

const temporaryRoot = await mkdtemp(resolve(tmpdir(), "imagemin-rs-cwebp-smoke-"));
const results = [];
try {
  for (const [format, fixture] of fixtures) {
    const input = Buffer.from(
      (await readFile(resolve(workspaceRoot, fixture), "utf8")).replaceAll(/\s+/gu, ""),
      "hex",
    );
    const inputPath = resolve(temporaryRoot, `input.${format}`);
    const outputPath = resolve(temporaryRoot, `${format}.webp`);
    await writeFile(inputPath, input);
    await execFileAsync(binary, ["-quiet", "-o", outputPath, "--", inputPath]);
    const output = await readFile(outputPath);
    assert.equal(output.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(output.subarray(8, 12).toString("ascii"), "WEBP");
    results.push({ format, inputBytes: input.byteLength, outputBytes: output.byteLength });
  }
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}

console.log(JSON.stringify({ binary: basename(binary), results, version: "1.6.0" }, undefined, 2));

function readFlag(flag) {
  const index = process.argv.indexOf(flag);
  const value = index === -1 ? undefined : process.argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new TypeError("Usage: node tasks/sidecars/smoke-cwebp.mjs --binary <path>");
  }
  return value;
}
