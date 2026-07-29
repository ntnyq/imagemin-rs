import assert from "node:assert/strict";
import { test } from "node:test";

import { runBinary } from "./run-binary.mjs";

test("accepts a successful child that closes stdin before consuming input", async () => {
  const result = await runBinary(
    process.execPath,
    ["--eval", "process.stdin.destroy(); setTimeout(() => process.exit(0), 50)"],
    Buffer.alloc(16 * 1024 * 1024),
  );

  assert.equal(result.stdout.byteLength, 0);
  assert.equal(result.stderr.byteLength, 0);
});

test("reports stderr from a failed child", async () => {
  await assert.rejects(
    runBinary(
      process.execPath,
      ["--eval", 'process.stderr.write("expected failure"); process.exit(7)'],
      Buffer.alloc(0),
    ),
    /exit code 7: expected failure/u,
  );
});
