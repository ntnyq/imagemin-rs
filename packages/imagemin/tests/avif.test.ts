import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

import sharp from "sharp";
import { afterEach, describe, expect, test } from "vitest";

import imagemin, { avif, webp } from "../src";
import { BinaryExitError, runBinary } from "../src/binary";
import type { AvifOptions } from "../src";

const PNG_URL = new URL("../../../fixtures/png/pngquant-rgba.hex", import.meta.url);
const APNG_URL = new URL("../../../fixtures/png/animation.hex", import.meta.url);
const GIF_URL = new URL("../../../fixtures/gif/animation.hex", import.meta.url);
const JPEG_URL = new URL("../../../fixtures/jpeg/color-metadata.hex", import.meta.url);
const TIFF_URL = new URL("../../../fixtures/webp/rgb-tiff.hex", import.meta.url);
const packageRequire = createRequire(new URL("../package.json", import.meta.url));
const oracleEntry = packageRequire.resolve("imagemin-avif");
const temporaryDirectories: string[] = [];

const ORACLE_WORKER_SOURCE = String.raw`
import { pathToFileURL } from "node:url";

const [oraclePath, optionsJson] = process.argv.slice(1);
try {
  const oracleModule = await import(pathToFileURL(oraclePath).href);
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const input = Buffer.concat(chunks);
  const output = await oracleModule.default(JSON.parse(optionsJson))(input);
  process.stdout.write(output);
} catch (error) {
  process.stderr.write(error instanceof Error ? error.name + ": " + error.message : String(error));
  process.exitCode = 1;
}
`;

const ORACLE_STATE_WORKER_SOURCE = String.raw`
import { pathToFileURL } from "node:url";

const [oraclePath] = process.argv.slice(1);
try {
  const oracleModule = await import(pathToFileURL(oraclePath).href);
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const input = Buffer.concat(chunks);
  const first = await oracleModule.default({ quality: 31 })(input);
  const leaked = await oracleModule.default()(input);
  process.stdout.write(JSON.stringify([first.toString("base64"), leaked.toString("base64")]));
} catch (error) {
  process.stderr.write(error instanceof Error ? error.name + ": " + error.message : String(error));
  process.exitCode = 1;
}
`;

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("AVIF compatibility", () => {
  test("matches imagemin-avif defaults semantically across static input formats", async () => {
    const png = await readHexFixture(PNG_URL);
    const jpeg = await readHexFixture(JPEG_URL);
    const tiff = await readHexFixture(TIFF_URL);
    const staticWebp = await webp({ lossless: true })(png);
    const staticGif = await sharp(png).gif().toBuffer();

    for (const input of [png, jpeg, staticGif, tiff, staticWebp]) {
      const [actual, expected] = await Promise.all([avif()(input), runOracle(input)]);
      const [inputMetadata, actualMetadata, expectedMetadata] = await Promise.all([
        sharp(input).metadata(),
        sharp(actual).metadata(),
        sharp(expected).metadata(),
      ]);

      expect(actualMetadata.format).toBe("heif");
      expect(expectedMetadata.format).toBe("heif");
      const displayDimensions = inputMetadata.autoOrient ?? {
        height: inputMetadata.height,
        width: inputMetadata.width,
      };
      expect([actualMetadata.width, actualMetadata.height]).toEqual([
        displayDimensions.width,
        displayDimensions.height,
      ]);
      // Sharp 0.33 (the upstream package's runtime) strips EXIF orientation
      // without rotating pixels; current Sharp fixes the displayed dimensions.
      if (inputMetadata.orientation === undefined) {
        expect([actualMetadata.width, actualMetadata.height]).toEqual([
          expectedMetadata.width,
          expectedMetadata.height,
        ]);
      } else {
        expect([expectedMetadata.width, expectedMetadata.height]).toEqual([
          inputMetadata.width,
          inputMetadata.height,
        ]);
      }
      expect(actualMetadata.space).toBe(expectedMetadata.space);
      expect(actualMetadata.hasAlpha).toBe(expectedMetadata.hasAlpha);
    }
  }, 30_000);

  test("uses the documented defaults without leaking option state", async () => {
    const input = await readHexFixture(PNG_URL);
    const [implicit, explicit, custom] = await Promise.all([
      avif()(input),
      avif({ chromaSubsampling: "4:2:0", lossless: false, quality: 90 })(input),
      avif({ quality: 31 })(input),
    ]);

    expect(Buffer.from(implicit)).toEqual(Buffer.from(explicit));
    expect(Buffer.from(implicit)).not.toEqual(Buffer.from(custom));

    const encodedPair = JSON.parse(
      Buffer.from(await runOracleStateProbe(input)).toString("utf8"),
    ) as [string, string];
    expect(encodedPair[0]).toBe(encodedPair[1]);
  }, 30_000);

  test("maps legacy speed to effort instead of silently ignoring it", async () => {
    const input = await readHexFixture(PNG_URL);
    const [fast, effortZero, slow, effortNine, upstreamFast, upstreamSlow] = await Promise.all([
      avif({ speed: 8 })(input),
      avif({ effort: 0 })(input),
      avif({ speed: 0 })(input),
      avif({ effort: 9 })(input),
      runOracle(input, { speed: 8 }),
      runOracle(input, { speed: 0 }),
    ]);

    expect(Buffer.from(fast)).toEqual(Buffer.from(effortZero));
    expect(Buffer.from(slow)).toEqual(Buffer.from(effortNine));
    expect(Buffer.from(fast)).not.toEqual(Buffer.from(slow));
    expect(Buffer.from(upstreamFast)).toEqual(Buffer.from(upstreamSlow));
  }, 30_000);

  test("preserves visible lossless RGBA and bounds lossy compositing error", async () => {
    const input = await readHexFixture(PNG_URL);
    const [before, lossless, lossy] = await Promise.all([
      decodeRgba(input),
      Promise.resolve(avif({ chromaSubsampling: "4:4:4", lossless: true })(input)).then(decodeRgba),
      Promise.resolve(avif({ quality: 80 })(input)).then(decodeRgba),
    ]);

    expect([lossless.info.width, lossless.info.height]).toEqual([128, 96]);
    expectVisibleRgbaClose(before.data, lossless.data, 2);
    expect(meanCompositedError(before.data, lossy.data, 0)).toBeLessThan(32);
    expect(meanCompositedError(before.data, lossy.data, 255)).toBeLessThan(32);
  }, 30_000);

  test("supports 4:4:4, strips source metadata, and re-encodes static AVIF", async () => {
    const [png, jpeg] = await Promise.all([readHexFixture(PNG_URL), readHexFixture(JPEG_URL)]);
    const [subsampled, fullChroma, stripped] = await Promise.all([
      avif({ chromaSubsampling: "4:2:0", quality: 70 })(png),
      avif({ chromaSubsampling: "4:4:4", quality: 70 })(png),
      avif()(jpeg),
    ]);
    const reencoded = await avif({ quality: 75 })(fullChroma);
    const [metadata, reencodedMetadata] = await Promise.all([
      sharp(stripped).metadata(),
      sharp(reencoded).metadata(),
    ]);

    expect(Buffer.from(subsampled)).not.toEqual(Buffer.from(fullChroma));
    expect(metadata.exif).toBeUndefined();
    expect(metadata.icc).toBeUndefined();
    expect(reencodedMetadata.format).toBe("heif");
    expect([reencodedMetadata.width, reencodedMetadata.height]).toEqual([128, 96]);
  }, 30_000);

  test("protects animations and multi-page images from first-frame conversion", async () => {
    const [png, apng, gif, tiff] = await Promise.all([
      readHexFixture(PNG_URL),
      readHexFixture(APNG_URL),
      readHexFixture(GIF_URL),
      readHexFixture(TIFF_URL),
    ]);
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
    const multipageTiff = Buffer.from(tiff);
    multipageTiff.writeUInt32LE(8, 8 + 2 + entryCount * 12);

    const avifSequence = Buffer.alloc(24);
    avifSequence.writeUInt32BE(24, 0);
    avifSequence.write("ftypavis", 4, "ascii");
    avifSequence.write("avis", 16, "ascii");

    await expect(avif()(apng)).resolves.toBe(apng);
    await expect(avif()(gif)).resolves.toBe(gif);
    await expect(avif()(animatedWebp)).resolves.toBe(animatedWebp);
    await expect(avif()(multipageTiff)).resolves.toBe(multipageTiff);
    await expect(avif()(avifSequence)).resolves.toBe(avifSequence);
  }, 30_000);

  test("preserves unsupported identity and returns stable codec errors", async () => {
    const unsupported = new Uint8Array([1, 2, 3]);
    const malformedPng = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

    await expect(avif()(unsupported)).resolves.toBe(unsupported);
    await expect(avif()(malformedPng)).rejects.toMatchObject({
      code: "ERR_IMAGEMIN_CODEC",
      plugin: "avif",
    });
    await expect(runOracle(malformedPng)).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof BinaryExitError && error.stderr.includes("callback is not defined"),
    );
  }, 30_000);

  test("rejects dimension and metadata bombs plus invalid options before spawning", async () => {
    const bomb = Buffer.from(await readHexFixture(PNG_URL));
    bomb.writeUInt32BE(100_000, 16);
    bomb.writeUInt32BE(100_000, 20);
    const metadataBomb = Buffer.alloc(24);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(metadataBomb);
    metadataBomb.writeUInt32BE(8 * 1024 * 1024 + 1, 8);
    metadataBomb.write("iCCP", 12, "ascii");
    const sideBomb = Buffer.from(await readHexFixture(PNG_URL));
    sideBomb.writeUInt32BE(16_385, 16);
    sideBomb.writeUInt32BE(1, 20);

    await expect(avif()(bomb)).rejects.toMatchObject({
      code: "ERR_IMAGEMIN_INVALID_INPUT",
      plugin: "avif",
    });
    await expect(avif()(metadataBomb)).rejects.toMatchObject({
      code: "ERR_IMAGEMIN_INVALID_INPUT",
      plugin: "avif",
    });
    await expect(avif()(sideBomb)).rejects.toMatchObject({
      code: "ERR_IMAGEMIN_INVALID_INPUT",
      plugin: "avif",
    });
    expect(() => avif({ quality: 0 })).toThrow(/quality/);
    expect(() => avif({ effort: 10 })).toThrow(/effort/);
    expect(() => avif({ speed: 9 })).toThrow(/speed/);
    expect(() => avif({ effort: 4, speed: 4 })).toThrow(/cannot be used together/);
    expect(() => avif({ bitdepth: 10 } as unknown as AvifOptions)).toThrow(/bitdepth/);
    expect(() => avif({ unknown: true } as unknown as AvifOptions)).toThrow(/Unknown avif option/);
  });

  test("changes file destinations to the detected AVIF extension", async () => {
    const root = await mkdtemp(join(tmpdir(), "imagemin-rs-avif-"));
    temporaryDirectories.push(root);
    const sourcePath = join(root, "photo.png");
    const destination = join(root, "output");
    await writeFile(sourcePath, await readHexFixture(PNG_URL));

    const [result] = await imagemin([sourcePath], {
      destination,
      glob: false,
      plugins: [avif({ quality: 80 })],
    });
    const expectedPath = join(destination, "photo.avif");

    if (result === undefined) throw new Error("Expected one optimized file result");

    expect(result.destinationPath).toBe(expectedPath);
    expect(result.format).toBe("avif");
    expect((await readFile(expectedPath)).subarray(4, 8).toString()).toBe("ftyp");
  }, 30_000);
});

async function runOracle(input: Uint8Array, options: Record<string, unknown> = {}) {
  return runBinary({
    arguments: [
      "--input-type=module",
      "--eval",
      ORACLE_WORKER_SOURCE,
      oracleEntry,
      JSON.stringify(options),
    ],
    binary: process.execPath,
    displayName: "imagemin-avif oracle",
    input,
    limits: {
      outputBytes: 64 * 1024 * 1024,
      stderrBytes: 1024 * 1024,
      timeoutMilliseconds: 30_000,
    },
  });
}

async function runOracleStateProbe(input: Uint8Array) {
  return runBinary({
    arguments: ["--input-type=module", "--eval", ORACLE_STATE_WORKER_SOURCE, oracleEntry],
    binary: process.execPath,
    displayName: "imagemin-avif state probe",
    input,
    limits: {
      outputBytes: 64 * 1024 * 1024,
      stderrBytes: 1024 * 1024,
      timeoutMilliseconds: 30_000,
    },
  });
}

async function readHexFixture(url: URL): Promise<Buffer> {
  const source = await readFile(url, "utf8");
  return Buffer.from(source.replaceAll(/\s/g, ""), "hex");
}

async function decodeRgba(input: Uint8Array) {
  return sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

function expectVisibleRgbaClose(left: Uint8Array, right: Uint8Array, tolerance: number): void {
  expect(right.byteLength).toBe(left.byteLength);
  for (let index = 0; index < left.byteLength; index += 4) {
    const alpha = left[index + 3] ?? 0;
    expect(Math.abs((right[index + 3] ?? 0) - alpha)).toBeLessThanOrEqual(tolerance);
    if (alpha === 0) continue;
    for (let channel = 0; channel < 3; channel += 1) {
      expect(
        Math.abs((right[index + channel] ?? 0) - (left[index + channel] ?? 0)),
      ).toBeLessThanOrEqual(tolerance);
    }
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
