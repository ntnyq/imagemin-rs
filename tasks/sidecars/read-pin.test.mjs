import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { test } from "node:test";

const execFileAsync = promisify(execFile);
const script = fileURLToPath(new URL("./read-pin.mjs", import.meta.url));

test("reads tool and source versions from pins.json", async () => {
  const mozjpeg = await execFileAsync(process.execPath, [script, "--tool", "mozjpeg"]);
  const zlib = await execFileAsync(process.execPath, [
    script,
    "--tool",
    "cwebp",
    "--source",
    "zlib",
  ]);

  assert.equal(mozjpeg.stdout, "4.1.1\n");
  assert.equal(zlib.stdout, "1.3.2\n");
});

test("rejects an unknown source", async () => {
  await assert.rejects(
    execFileAsync(process.execPath, [script, "--tool", "cwebp", "--source", "unknown"]),
    /Unknown pinned source: cwebp\.sources\.unknown/u,
  );
});
