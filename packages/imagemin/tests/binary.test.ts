import { setTimeout as delay } from "node:timers/promises";

import { describe, expect, test } from "vitest";

import { runBinary } from "../src/binary";

const LIMITS = {
  outputBytes: 1024,
  stderrBytes: 1024,
  timeoutMilliseconds: 10_000,
};

describe("sidecar cancellation", () => {
  test("rejects a pre-aborted operation before resolving the executable", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      runBinary({
        arguments: [],
        binary: "/definitely/not/an/executable",
        displayName: "fixture",
        input: new Uint8Array(),
        limits: LIMITS,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: "ERR_IMAGEMIN_ABORTED" });
  });

  test("kills an in-flight child process when its signal aborts", async () => {
    const controller = new AbortController();
    const operation = runBinary({
      arguments: ["--eval", "process.stdin.resume(); setInterval(() => undefined, 1000)"],
      binary: process.execPath,
      displayName: "fixture",
      input: new Uint8Array(),
      limits: LIMITS,
      signal: controller.signal,
    });
    await delay(25);
    controller.abort();

    await expect(operation).rejects.toMatchObject({ code: "ERR_IMAGEMIN_ABORTED" });
  });
});
