import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

import { optimizeNative } from "../src-js/index.js";

const ONE_PIXEL_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010804000000b51c0c020000000b4944415478da6364f80f00010501012718e3660000000049454e44ae426082",
  "hex",
);

const BASIC_SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><!-- comment --><rect width="16" height="16" fill="#ff0000"/></svg>',
);

const ANIMATED_GIF_URL = new URL("../../../fixtures/gif/animation.hex", import.meta.url);

describe("native binding", () => {
  test("runs oxipng through an async task", async () => {
    const pending = optimizeNative(ONE_PIXEL_PNG, [
      {
        name: "oxipng",
        optionsJson: '{"optimizationLevel":2}',
      },
    ]);

    expect(pending).toBeInstanceOf(Promise);

    const result = await pending;

    expect(result.format).toBe("png");
    expect(result.outputBytes).toBeLessThanOrEqual(result.inputBytes);
    expect(result.steps).toHaveLength(1);
    expect(Buffer.from(result.data).subarray(0, 8)).toEqual(ONE_PIXEL_PNG.subarray(0, 8));
  });

  test("runs the OptiPNG compatibility profile through an async task", async () => {
    const result = await optimizeNative(ONE_PIXEL_PNG, [
      {
        name: "optipng",
        optionsJson: '{"optimizationLevel":3}',
      },
    ]);

    expect(result.format).toBe("png");
    expect(result.outputBytes).toBeGreaterThan(0);
    expect(result.steps).toEqual([expect.objectContaining({ plugin: "optipng" })]);
  });

  test("optimizes GIF through the permissive worker-pool profile", async () => {
    const input = Buffer.from((await readFile(ANIMATED_GIF_URL, "utf8")).trim(), "hex");
    const result = await optimizeNative(input, [
      {
        name: "giflossless",
        optionsJson: "{}",
      },
    ]);

    expect(result.format).toBe("gif");
    expect(result.outputBytes).toBeLessThan(result.inputBytes);
    expect(result.steps).toEqual([expect.objectContaining({ plugin: "giflossless" })]);
  });

  test("rejects unknown native options before codec execution", () => {
    expect(() =>
      optimizeNative(ONE_PIXEL_PNG, [
        {
          name: "oxipng",
          optionsJson: '{"quality":80}',
        },
      ]),
    ).toThrow(/ERR_IMAGEMIN_INVALID_OPTIONS/);
  });

  test("rejects unknown native plugins before scheduling work", () => {
    expect(() =>
      optimizeNative(ONE_PIXEL_PNG, [
        {
          name: "missing",
          optionsJson: "{}",
        },
      ]),
    ).toThrow(/ERR_IMAGEMIN_UNSUPPORTED_PLUGIN/);
  });

  test("optimizes SVG on the worker pool", async () => {
    const result = await optimizeNative(BASIC_SVG, [
      {
        name: "svgm",
        optionsJson: "{}",
      },
    ]);

    expect(result.format).toBe("svg");
    expect(result.outputBytes).toBeLessThan(result.inputBytes);
    expect(result.steps).toEqual([expect.objectContaining({ changed: true, plugin: "svgm" })]);
  });
});
