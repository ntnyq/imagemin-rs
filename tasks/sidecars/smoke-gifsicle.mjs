import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = fileURLToPath(new URL("../../", import.meta.url));
const binary = resolve(readFlag("--binary"));
const fixture = Buffer.from(
  (await readFile(resolve(workspaceRoot, "fixtures/gif/animation.hex"), "utf8")).replaceAll(
    /\s+/gu,
    "",
  ),
  "hex",
);
const version = await run(["--version"], Buffer.alloc(0));
assert.match(`${version.stdout}${version.stderr}`, /Gifsicle 1\.96/u);

const optimized = await run(["--no-warnings", "--no-app-extensions", "--optimize=3"], fixture);
assert.equal(optimized.stdout.subarray(0, 3).toString("ascii"), "GIF");

console.log(
  JSON.stringify(
    {
      inputBytes: fixture.byteLength,
      outputBytes: optimized.stdout.byteLength,
      version: "1.96",
    },
    undefined,
    2,
  ),
);

function run(arguments_, input) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(binary, arguments_, { stdio: ["pipe", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      const result = {
        stderr: Buffer.concat(stderr),
        stdout: Buffer.concat(stdout),
      };
      if (code === 0) resolvePromise(result);
      else {
        reject(
          new Error(
            `${binary} failed with ${signal ?? `exit code ${code}`}: ${result.stderr.toString()}`,
          ),
        );
      }
    });
    child.stdin.end(input);
  });
}

function readFlag(flag) {
  const index = process.argv.indexOf(flag);
  const value = index === -1 ? undefined : process.argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new TypeError("Usage: node tasks/sidecars/smoke-gifsicle.mjs --binary <path>");
  }
  return value;
}
