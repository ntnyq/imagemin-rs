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

test("launches Windows executables directly", () => {
  assert.deepEqual(
    resolveSpawnCommand("C:\\Program Files\\nodejs\\node.exe", ["worker.mjs"], {
      platform: "win32",
    }),
    {
      arguments: ["worker.mjs"],
      command: "C:\\Program Files\\nodejs\\node.exe",
    },
  );
});

test("does not append a second extension to Windows command shims", () => {
  assert.deepEqual(
    resolveSpawnCommand("npm.cmd", ["install"], {
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
