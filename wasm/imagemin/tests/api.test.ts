import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, test } from "vitest";

import {
  ImageminError,
  giflossless,
  initWasm,
  optimize,
  optipng,
  oxipng,
  svgm,
} from "../src/index";

const wasm = new URL("../src/generated/imagemin_wasm_core_bg.wasm", import.meta.url);
const pngFixture = new URL("../../../fixtures/png/gradient.hex", import.meta.url);
const gifFixture = new URL("../../../fixtures/gif/animation.hex", import.meta.url);

beforeAll(async () => {
  await initWasm(await readFile(wasm));
});

describe("@imagemin-rs/wasm", () => {
  test("runs PNG profiles through the shared Rust pipeline", async () => {
    const input = await readHexFixture(pngFixture);
    const result = await optimize(input, {
      plugins: [oxipng({ optimizationLevel: 3 }), optipng({ optimizationLevel: 2 })],
    });

    expect(result.data).toBeInstanceOf(Uint8Array);
    expect(result.format).toBe("png");
    expect(result.inputBytes).toBe(input.byteLength);
    expect(result.outputBytes).toBe(result.data.byteLength);
    expect(result.steps.map((step) => step.plugin)).toEqual(["oxipng", "optipng"]);
  });

  test("optimizes animated GIF and SVG inputs without Canvas", async () => {
    const gifInput = await readHexFixture(gifFixture);
    const gifResult = await optimize(gifInput, {
      plugins: [giflossless({ strip: true })],
    });
    const svgInput = new TextEncoder().encode(
      '<svg viewBox="0 0 24 24"><!-- remove --><path fill="#ff0000" d="M0 0h24v24z"/></svg>',
    );
    const svgResult = await optimize(svgInput, {
      plugins: [svgm()],
    });

    expect(new TextDecoder().decode(gifResult.data.subarray(0, 6))).toBe("GIF89a");
    expect(gifResult.steps).toHaveLength(1);
    expect(svgResult.outputBytes).toBeLessThan(svgResult.inputBytes);
    expect(new TextDecoder().decode(svgResult.data)).not.toContain("<!--");
  });

  test("keeps custom browser plugins in pipeline order", async () => {
    const input = new TextEncoder().encode('<svg><!-- remove --><path d="M0 0h1v1z"/></svg>');
    const rename = async (bytes: Uint8Array) => new Uint8Array(bytes);
    Object.defineProperty(rename, "name", { value: "example:copy" });

    const result = await optimize(input, {
      plugins: [svgm(), rename],
    });

    expect(result.steps.map((step) => step.plugin)).toEqual(["svgm", "example:copy"]);
    expect(result.steps[1]?.changed).toBe(false);
  });

  test("normalizes Rust validation errors", async () => {
    const input = await readHexFixture(pngFixture);
    const operation = optimize(input, {
      // @ts-expect-error validates external JavaScript values at the WASM boundary
      plugins: [oxipng({ optimizationLevel: 7 })],
    });

    await expect(operation).rejects.toBeInstanceOf(ImageminError);
    await expect(operation).rejects.toMatchObject({
      code: "ERR_IMAGEMIN_INVALID_OPTIONS",
      name: "ImageminError",
      plugin: "oxipng",
    });
  });
});

async function readHexFixture(url: URL): Promise<Uint8Array> {
  const hex = (await readFile(url, "utf8")).trim();
  return Uint8Array.from(hex.match(/.{2}/gu) ?? [], (byte) => Number.parseInt(byte, 16));
}
