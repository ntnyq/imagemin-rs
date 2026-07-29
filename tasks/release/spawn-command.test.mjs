import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveSpawnCommand } from "./spawn-command.mjs";

test("launches Windows command shims through the command interpreter", () => {
  assert.deepEqual(
    resolveSpawnCommand("npm", ["install"], {
      commandInterpreter: "C:\\Windows\\System32\\cmd.exe",
      platform: "win32",
    }),
    {
      arguments: ["/d", "/s", "/c", "npm.cmd", "install"],
      command: "C:\\Windows\\System32\\cmd.exe",
    },
  );
});

test("launches POSIX executables directly", () => {
  assert.deepEqual(resolveSpawnCommand("npm", ["install"], { platform: "linux" }), {
    arguments: ["install"],
    command: "npm",
  });
});
