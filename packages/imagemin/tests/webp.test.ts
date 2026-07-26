import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import imageminWebp from "imagemin-webp";
import sharp from "sharp";
import { afterEach, describe, expect, test } from "vitest";

import imagemin, { webp } from "../src";
import type { WebpOptions } from "../src";

const PNG_URL = new URL("../../../fixtures/png/pngquant-rgba.hex", import.meta.url);
const APNG_URL = new URL("../../../fixtures/png/animation.hex", import.meta.url);
const JPEG_URL = new URL("../../../fixtures/jpeg/color-metadata.hex", import.meta.url);
const TIFF_URL = new URL("../../../fixtures/webp/rgb-tiff.hex", import.meta.url);
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("WebP compatibility", () => {
  test("matches imagemin-webp 8 across input formats and supported options", async () => {
    const png = await readHexFixture(PNG_URL);
    const jpeg = await readHexFixture(JPEG_URL);
    const tiff = await readHexFixture(TIFF_URL);
    const staticWebp = await imageminWebp({ quality: 81 })(png);
    const matrix: Array<{ input: Buffer; options: WebpOptions }> = [
      { input: png, options: {} },
      {
        input: png,
        options: {
          alphaQuality: 91,
          autoFilter: true,
          filter: 35,
          method: 6,
          preset: "picture",
          quality: 82,
          sharpness: 4,
          sns: 70,
        },
      },
      { input: png, options: { lossless: true } },
      { input: png, options: { lossless: 7, nearLossless: 80 } },
      {
        input: tiff,
        options: {
          crop: { height: 30, width: 40, x: 8, y: 6 },
          quality: 79,
          resize: { height: 15, width: 20 },
        },
      },
      { input: jpeg, options: { metadata: ["icc", "exif"], quality: 84 } },
      { input: staticWebp, options: { quality: 76 } },
    ];

    for (const { input, options } of matrix) {
      const [actual, expected] = await Promise.all([
        webp(options)(input),
        imageminWebp(options)(input),
      ]);
      expect(Buffer.from(actual)).toEqual(expected);
    }
  });

  test("fixes upstream zero-value omissions instead of silently using defaults", async () => {
    const input = await readHexFixture(PNG_URL);
    const [actualQualityZero, actualDefault, upstreamQualityZero, upstreamDefault] =
      await Promise.all([
        webp({ quality: 0 })(input),
        webp()(input),
        imageminWebp({ quality: 0 })(input),
        imageminWebp()(input),
      ]);

    expect(upstreamQualityZero).toEqual(upstreamDefault);
    expect(Buffer.from(actualQualityZero)).not.toEqual(Buffer.from(actualDefault));

    const [actualMethodZero, upstreamMethodZero] = await Promise.all([
      webp({ method: 0 })(input),
      imageminWebp({ method: 0 })(input),
    ]);
    expect(upstreamMethodZero).toEqual(upstreamDefault);
    expect(Buffer.from(actualMethodZero)).not.toEqual(Buffer.from(actualDefault));
  });

  test("decodes losslessly with alpha and bounds lossy visual error", async () => {
    const input = await readHexFixture(PNG_URL);
    const [lossless, lossy] = await Promise.all([
      webp({ lossless: true })(input),
      webp({ quality: 80 })(input),
    ]);
    const [before, losslessDecoded, lossyDecoded] = await Promise.all([
      decodeRgba(input),
      decodeRgba(lossless),
      decodeRgba(lossy),
    ]);

    expect([losslessDecoded.info.width, losslessDecoded.info.height]).toEqual([128, 96]);
    expectVisibleRgbaEqual(before.data, losslessDecoded.data);
    expect(meanCompositedError(before.data, lossyDecoded.data, 0)).toBeLessThan(32);
    expect(meanCompositedError(before.data, lossyDecoded.data, 255)).toBeLessThan(32);
  });

  test("converts TIFF and applies crop before resize", async () => {
    const input = await readHexFixture(TIFF_URL);
    const output = await webp({
      crop: { height: 30, width: 40, x: 8, y: 6 },
      resize: { height: 15, width: 20 },
    })(input);
    const metadata = await sharp(output).metadata();

    expect(metadata.format).toBe("webp");
    expect([metadata.width, metadata.height]).toEqual([20, 15]);
  });

  test("copies only requested JPEG metadata chunks", async () => {
    const input = await readHexFixture(JPEG_URL);
    const [stripped, retained, upstreamRetained] = await Promise.all([
      webp()(input),
      webp({ metadata: ["icc", "exif"] })(input),
      imageminWebp({ metadata: ["icc", "exif"] })(input),
    ]);

    expect(webpChunkTypes(stripped)).toEqual(["VP8 "]);
    // The vendored Windows cwebp decodes JPEG through WIC and does not
    // extract EXIF there, so the retained chunk set is platform-dependent.
    // Parity with upstream imagemin-webp running the same binary is the
    // compatibility claim; the self-built release cwebp must restore EXIF
    // on Windows and remove this branch (ADR 0006).
    const expectedChunks =
      process.platform === "win32" ? ["VP8X", "ICCP", "VP8 "] : ["VP8X", "ICCP", "VP8 ", "EXIF"];
    expect(webpChunkTypes(retained)).toEqual(expectedChunks);
    expect(webpChunkTypes(new Uint8Array(upstreamRetained))).toEqual(expectedChunks);
    expect(webpChunkPayload(retained, "ICCP")?.byteLength).toBeGreaterThan(0);
    if (process.platform !== "win32") {
      expect(webpChunkPayload(retained, "EXIF")?.byteLength).toBeGreaterThan(0);
    }
  });

  test("protects animations and multi-page images from first-frame conversion", async () => {
    const png = await readHexFixture(PNG_URL);
    const apng = await readHexFixture(APNG_URL);
    const tiff = await readHexFixture(TIFF_URL);
    const staticWebp = await webp({ lossless: true })(png);
    const animationChunk = Buffer.alloc(14);
    animationChunk.write("ANIM", 0, "ascii");
    animationChunk.writeUInt32LE(6, 4);
    const animatedWebp = Buffer.concat([
      Buffer.from(staticWebp).subarray(0, 12),
      animationChunk,
      Buffer.from(staticWebp).subarray(12),
    ]);
    animatedWebp.writeUInt32LE(animatedWebp.byteLength - 8, 4);

    const entryCount = tiff.readUInt16LE(8);
    const nextIfdOffset = 8 + 2 + entryCount * 12;
    const multipageTiff = Buffer.from(tiff);
    multipageTiff.writeUInt32LE(8, nextIfdOffset);

    await expect(webp()(apng)).resolves.toBe(apng);
    await expect(webp()(animatedWebp)).resolves.toBe(animatedWebp);
    await expect(webp()(multipageTiff)).resolves.toBe(multipageTiff);
  });

  test("preserves unsupported identity and reports malformed readable input", async () => {
    const unsupported = new Uint8Array([1, 2, 3]);
    const malformedPng = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

    await expect(webp()(unsupported)).resolves.toBe(unsupported);
    await expect(webp()(malformedPng)).rejects.toMatchObject({
      code: "ERR_IMAGEMIN_CODEC",
      plugin: "webp",
    });
  });

  test("rejects dimension bombs and invalid options before spawning", async () => {
    const bomb = Buffer.from(await readHexFixture(PNG_URL));
    bomb.writeUInt32BE(100_000, 16);
    bomb.writeUInt32BE(100_000, 20);
    const metadataBomb = Buffer.alloc(24);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(metadataBomb);
    metadataBomb.writeUInt32BE(8 * 1024 * 1024 + 1, 8);
    metadataBomb.write("iCCP", 12, "ascii");

    await expect(webp()(bomb)).rejects.toMatchObject({
      code: "ERR_IMAGEMIN_INVALID_INPUT",
      plugin: "webp",
    });
    await expect(webp()(metadataBomb)).rejects.toMatchObject({
      code: "ERR_IMAGEMIN_INVALID_INPUT",
      plugin: "webp",
    });
    expect(() => webp({ quality: 101 })).toThrow(/quality/);
    expect(() => webp({ method: 7 })).toThrow(/method/);
    expect(() => webp({ lossless: 10 })).toThrow(/lossless/);
    expect(() => webp({ resize: { height: 0, width: 0 } })).toThrow(/resize/);
    expect(() => webp({ resize: { height: 1, width: 16_384 } })).toThrow(/resize.width/);
    expect(() => webp({ metadata: ["all", "exif"] })).toThrow(/cannot be combined/);
    expect(() => webp({ unknown: true } as unknown as WebpOptions)).toThrow(/Unknown webp option/);
  });

  test("changes file destinations to the detected WebP extension", async () => {
    const root = await mkdtemp(join(tmpdir(), "imagemin-rs-webp-"));
    temporaryDirectories.push(root);
    const sourcePath = join(root, "photo.png");
    const destination = join(root, "output");
    await writeFile(sourcePath, await readHexFixture(PNG_URL));

    const [result] = await imagemin([sourcePath], {
      destination,
      glob: false,
      plugins: [webp({ quality: 80 })],
    });
    const expectedPath = join(destination, "photo.webp");

    if (result === undefined) throw new Error("Expected one optimized file result");

    expect(result.destinationPath).toBe(expectedPath);
    expect(result.format).toBe("webp");
    expect((await readFile(expectedPath)).subarray(0, 4).toString()).toBe("RIFF");
  });
});

async function readHexFixture(url: URL): Promise<Buffer> {
  const source = await readFile(url, "utf8");
  return Buffer.from(source.replaceAll(/\s/g, ""), "hex");
}

async function decodeRgba(input: Uint8Array) {
  return sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

function expectVisibleRgbaEqual(left: Uint8Array, right: Uint8Array): void {
  expect(right.byteLength).toBe(left.byteLength);
  for (let index = 0; index < left.byteLength; index += 4) {
    const alpha = left[index + 3] ?? 0;
    expect(right[index + 3]).toBe(alpha);
    if (alpha === 0) continue;
    expect(right.subarray(index, index + 3)).toEqual(left.subarray(index, index + 3));
  }
}

function meanCompositedError(left: Uint8Array, right: Uint8Array, background: number): number {
  expect(right.byteLength).toBe(left.byteLength);
  let total = 0;
  let samples = 0;
  for (let index = 0; index < left.byteLength; index += 4) {
    const leftAlpha = left[index + 3] ?? 0;
    const rightAlpha = right[index + 3] ?? 0;
    total += Math.abs(leftAlpha - rightAlpha);
    samples += 1;
    for (let channel = 0; channel < 3; channel += 1) {
      const leftComposite =
        ((left[index + channel] ?? 0) * leftAlpha + background * (255 - leftAlpha)) / 255;
      const rightComposite =
        ((right[index + channel] ?? 0) * rightAlpha + background * (255 - rightAlpha)) / 255;
      total += Math.abs(leftComposite - rightComposite);
      samples += 1;
    }
  }
  return total / samples;
}

function webpChunkTypes(input: Uint8Array): string[] {
  const buffer = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  const types: string[] = [];
  let position = 12;

  while (position + 8 <= buffer.byteLength) {
    const type = buffer.subarray(position, position + 4).toString("ascii");
    const size = buffer.readUInt32LE(position + 4);
    if (position + 8 + size > buffer.byteLength) break;
    types.push(type);
    position += 8 + size + (size & 1);
  }
  return types;
}

function webpChunkPayload(input: Uint8Array, expectedType: string): Uint8Array | undefined {
  const buffer = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  let position = 12;

  while (position + 8 <= buffer.byteLength) {
    const type = buffer.subarray(position, position + 4).toString("ascii");
    const size = buffer.readUInt32LE(position + 4);
    const end = position + 8 + size;
    if (end > buffer.byteLength) return undefined;
    if (type === expectedType) return buffer.subarray(position + 8, end);
    position = end + (size & 1);
  }
  return undefined;
}
