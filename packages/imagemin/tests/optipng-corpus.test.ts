import { Buffer } from "node:buffer";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { promisify } from "node:util";

import { describe, expect, test } from "vitest";
import upstreamOptipng from "imagemin-optipng";

import imagemin, { optipng } from "../src/index";
import {
  buildOptipngCorpus,
  decodeRgba64,
  encodeChunk,
  pngChunks,
  pngChunkTypes,
  pngHeader,
  type CorpusEntry,
  type Rgba64Image,
} from "./png-corpus";

// Corpus differential against `imagemin-optipng@8.0.0` running the real
// OptiPNG binary shipped by `optipng-bin@7.0.1`. The native profile promises
// lossless pixels and OptiPNG option semantics, not byte parity (ADR 0003),
// so the gates here are: exact pixel equality through an independent decoder,
// identical chunk-stripping policy, identical option semantics, and bounded
// size divergence with every known structural difference codified explicitly.

const execFileAsync = promisify(execFile);
const packageRequire = createRequire(new URL("../package.json", import.meta.url));
const oracleRequire = createRequire(packageRequire.resolve("imagemin-optipng"));
const optipngBinaryPath = oracleRequire("optipng-bin") as string;

const APNG_URL = new URL("../../../fixtures/png/animation.hex", import.meta.url);

// Output chunks both optimizers may legitimately keep after `-strip all`.
const STRUCTURAL_CHUNKS = new Set(["IHDR", "PLTE", "tRNS", "IDAT", "IEND"]);

// Default-level size gate: ours must stay within 15% + 8 bytes of OptiPNG.
const SIZE_RATIO = 1.15;
const SIZE_SLACK = 8;

// Oxipng preset 3 (the level-3 mapping) loses to OptiPNG's zlib strategy
// trials on single-pixel-wide columns; level 7 closes the gap (asserted
// below). This is the one known degenerate geometry in the corpus.
const DEGENERATE_DEFAULT_RATIOS = new Map([["gray-8bit-tall-1x64", 2.6]]);

const corpus = buildOptipngCorpus();

function entryByName(name: string): CorpusEntry {
  const entry = corpus.find((candidate) => candidate.name === name);
  if (entry === undefined) throw new Error(`Missing corpus entry ${name}`);
  return entry;
}

describe("OptiPNG corpus differential", () => {
  test("pins the imagemin-optipng oracle to an OptiPNG 0.7.x binary", async () => {
    // optipng-bin@7.0.1 vendors the OptiPNG 0.7.7 source, but its prebuilt
    // macOS binary reports 0.7.6 — the same upstream platform drift already
    // documented for pngquant-bin. The release gate owns unifying sidecars;
    // this differential runs against whichever 0.7.x binary upstream ships.
    const { stdout } = await execFileAsync(optipngBinaryPath, ["-version"]);
    expect(stdout).toMatch(/^OptiPNG version 0\.7\.\d+/);
  });

  test("corpus fixtures round-trip through the spec-exact decoder", () => {
    const failures = corpus
      .filter((entry) => !samePixels(decodeRgba64(entry.bytes), entry.rgba))
      .map((entry) => entry.name);
    expect(failures).toEqual([]);
  });

  test("stays pixel-lossless with an identical strip policy across the corpus", async () => {
    const failures: string[] = [];
    let ourTotal = 0;
    let theirTotal = 0;

    for (const entry of corpus) {
      const [ours, theirs] = await Promise.all([
        imagemin.buffer(entry.bytes, { plugins: [optipng()] }),
        upstreamOptipng()(entry.bytes),
      ]);
      ourTotal += ours.length;
      theirTotal += theirs.length;

      if (!samePixels(decodeRgba64(ours), entry.rgba)) {
        failures.push(`${entry.name}: native output is not pixel-lossless`);
      }
      if (!samePixels(decodeRgba64(theirs), entry.rgba)) {
        failures.push(`${entry.name}: oracle output is not pixel-lossless`);
      }

      // `-strip all` parity: neither side may keep any ancillary metadata
      // (gAMA, sRGB, pHYs, bKGD, tIME, text and private chunks all go).
      for (const [label, output] of [
        ["native", ours],
        ["oracle", theirs],
      ] as const) {
        const kept = pngChunkTypes(output).filter((type) => !STRUCTURAL_CHUNKS.has(type));
        if (kept.length > 0) {
          failures.push(`${entry.name}: ${label} output kept ${kept.join(",")}`);
        }
      }

      // Oxipng may pick a different lossless representation than OptiPNG
      // (it also expands palettes to truecolor, OptiPNG only ever reduces
      // toward palettes). The divergence is only acceptable when it pays
      // for itself in bytes.
      const ourHeader = pngHeader(ours);
      const theirHeader = pngHeader(theirs);
      const sameRepresentation =
        ourHeader.colorType === theirHeader.colorType &&
        ourHeader.bitDepth === theirHeader.bitDepth;
      if (!sameRepresentation && ours.length >= theirs.length) {
        failures.push(
          `${entry.name}: representation diverged without a size win ` +
            `(${ours.length} vs ${theirs.length} bytes)`,
        );
      }

      const ratio = DEGENERATE_DEFAULT_RATIOS.get(entry.name) ?? SIZE_RATIO;
      if (ours.length > Math.max(theirs.length * ratio, theirs.length + SIZE_SLACK)) {
        failures.push(`${entry.name}: ${ours.length} bytes exceeds gate vs ${theirs.length}`);
      }
    }

    expect(failures).toEqual([]);
    // Aggregate: the native profile must not lose to OptiPNG overall.
    expect(ourTotal).toBeLessThanOrEqual(theirTotal * 0.9);
  }, 240_000);

  test("matches OptiPNG chunk-for-chunk at optimization level 0", async () => {
    // OptiPNG defines -o0 as -o1 -nx -nz; both sides must leave the IDAT
    // stream untouched and only strip metadata. The single byte-level
    // difference across the corpus is that Oxipng also drops trailing
    // fully-opaque tRNS entries — a lossless canonicalization OptiPNG
    // skips — so tRNS is compared as a prefix rule instead.
    const failures: string[] = [];

    for (const entry of corpus) {
      const [ours, theirs] = await Promise.all([
        imagemin.buffer(entry.bytes, { plugins: [optipng({ optimizationLevel: 0 })] }),
        upstreamOptipng({ optimizationLevel: 0 })(entry.bytes),
      ]);

      const ourChunks = pngChunks(ours);
      const theirChunks = pngChunks(theirs);
      if (ourChunks.length !== theirChunks.length) {
        failures.push(`${entry.name}: chunk count ${ourChunks.length} vs ${theirChunks.length}`);
        continue;
      }
      for (const [index, ourChunk] of ourChunks.entries()) {
        const theirChunk = theirChunks[index];
        if (theirChunk === undefined || ourChunk.type !== theirChunk.type) {
          failures.push(`${entry.name}: chunk ${index} is ${ourChunk.type}`);
          continue;
        }
        const ourData = Buffer.from(ourChunk.data);
        const theirData = Buffer.from(theirChunk.data);
        if (ourData.equals(theirData)) continue;
        const isTrnsPrefix =
          ourChunk.type === "tRNS" &&
          ourData.length < theirData.length &&
          ourData.equals(theirData.subarray(0, ourData.length)) &&
          theirData.subarray(ourData.length).every((alpha) => alpha === 255);
        if (!isTrnsPrefix) {
          failures.push(`${entry.name}: ${ourChunk.type} chunk bytes diverge`);
        }
      }
    }

    expect(failures).toEqual([]);
  }, 240_000);

  test("agrees on interlacing in both directions", async () => {
    const subset = [
      "gray-16bit-reducible-12x8",
      "rgb-8bit-few-colors-24x16",
      "palette-8bit-200-colors-40x30",
      "rgba-8bit-opaque-24x16",
      "rgb-8bit-metadata-laden-32x24",
    ].map(entryByName);
    const failures: string[] = [];

    for (const entry of subset) {
      const [ours, theirs] = await Promise.all([
        imagemin.buffer(entry.bytes, { plugins: [optipng({ interlaced: true })] }),
        upstreamOptipng({ interlaced: true })(entry.bytes),
      ]);
      if (pngHeader(ours).interlace !== 1) failures.push(`${entry.name}: native not interlaced`);
      if (pngHeader(theirs).interlace !== 1) failures.push(`${entry.name}: oracle not interlaced`);
      if (!samePixels(decodeRgba64(ours), entry.rgba)) {
        failures.push(`${entry.name}: native interlaced output lost pixels`);
      }
      if (!samePixels(decodeRgba64(theirs), entry.rgba)) {
        failures.push(`${entry.name}: oracle interlaced output lost pixels`);
      }
      if (ours.length > Math.max(theirs.length * SIZE_RATIO, theirs.length + SIZE_SLACK)) {
        failures.push(`${entry.name}: interlaced ${ours.length} vs ${theirs.length}`);
      }
    }

    // The default `-i 0` also deinterlaces Adam7 input on both sides.
    const base = entryByName("rgb-8bit-gradient-32x24");
    const interlaced = await imagemin.buffer(base.bytes, {
      plugins: [optipng({ interlaced: true })],
    });
    expect(pngHeader(interlaced).interlace).toBe(1);
    const [oursFlat, theirsFlat] = await Promise.all([
      imagemin.buffer(interlaced, { plugins: [optipng()] }),
      upstreamOptipng()(Buffer.from(interlaced)),
    ]);
    expect(pngHeader(oursFlat).interlace).toBe(0);
    expect(pngHeader(theirsFlat).interlace).toBe(0);
    expect(samePixels(decodeRgba64(oursFlat), base.rgba)).toBe(true);
    expect(samePixels(decodeRgba64(theirsFlat), base.rgba)).toBe(true);

    expect(failures).toEqual([]);
  }, 240_000);

  test("preserves the input representation when reductions are disabled", async () => {
    const subset = [
      "gray-16bit-reducible-12x8",
      "rgb-8bit-few-colors-24x16",
      "palette-8bit-200-colors-40x30",
      "rgba-8bit-opaque-24x16",
      "gray-8bit-binary-16x16",
    ].map(entryByName);
    const options = {
      bitDepthReduction: false,
      colorTypeReduction: false,
      paletteReduction: false,
    };
    const failures: string[] = [];

    for (const entry of subset) {
      const inputHeader = pngHeader(entry.bytes);
      const [ours, theirs] = await Promise.all([
        imagemin.buffer(entry.bytes, { plugins: [optipng(options)] }),
        upstreamOptipng(options)(entry.bytes),
      ]);
      for (const [label, output] of [
        ["native", ours],
        ["oracle", theirs],
      ] as const) {
        const header = pngHeader(output);
        if (
          header.colorType !== inputHeader.colorType ||
          header.bitDepth !== inputHeader.bitDepth
        ) {
          failures.push(
            `${entry.name}: ${label} changed representation to ` +
              `type=${header.colorType} depth=${header.bitDepth}`,
          );
        }
        if (!samePixels(decodeRgba64(output), entry.rgba)) {
          failures.push(`${entry.name}: ${label} lost pixels`);
        }
      }
      if (ours.length > Math.max(theirs.length * SIZE_RATIO, theirs.length + SIZE_SLACK)) {
        failures.push(`${entry.name}: ${ours.length} vs ${theirs.length}`);
      }
    }

    expect(failures).toEqual([]);
  }, 240_000);

  test("matches or beats OptiPNG at the exhaustive level 7 mapping", async () => {
    // Level 7 maps to Oxipng preset 6 (ADR 0003). The preset-3 degenerate
    // geometry gap must disappear here.
    const subset = [
      "gray-8bit-tall-1x64",
      "gray-8bit-one-pixel",
      "rgb-8bit-noise-48x32",
      "rgb-8bit-few-colors-24x16",
      "palette-8bit-200-colors-40x30",
      "gray-16bit-reducible-12x8",
      "rgba-8bit-opaque-24x16",
      "rgb-8bit-metadata-laden-32x24",
    ].map(entryByName);
    const failures: string[] = [];

    for (const entry of subset) {
      const [ours, theirs] = await Promise.all([
        imagemin.buffer(entry.bytes, { plugins: [optipng({ optimizationLevel: 7 })] }),
        upstreamOptipng({ optimizationLevel: 7 })(entry.bytes),
      ]);
      if (!samePixels(decodeRgba64(ours), entry.rgba)) {
        failures.push(`${entry.name}: native output lost pixels`);
      }
      if (!samePixels(decodeRgba64(theirs), entry.rgba)) {
        failures.push(`${entry.name}: oracle output lost pixels`);
      }
      if (ours.length > Math.max(theirs.length * SIZE_RATIO, theirs.length + SIZE_SLACK)) {
        failures.push(`${entry.name}: ${ours.length} vs ${theirs.length}`);
      }
    }

    expect(failures).toEqual([]);
  }, 240_000);

  test("recovers the same corrupted input only when errorRecovery allows it", async () => {
    const base = entryByName("rgb-8bit-gradient-32x24");
    const corrupted = corruptIdatCrc(base.bytes);

    const [ours, theirs] = await Promise.all([
      imagemin.buffer(corrupted, { plugins: [optipng()] }),
      upstreamOptipng()(corrupted),
    ]);
    expect(samePixels(decodeRgba64(ours), base.rgba)).toBe(true);
    expect(samePixels(decodeRgba64(theirs), base.rgba)).toBe(true);

    await expect(
      imagemin.buffer(corrupted, { plugins: [optipng({ errorRecovery: false })] }),
    ).rejects.toMatchObject({ code: "ERR_IMAGEMIN_CODEC" });
    await expect(upstreamOptipng({ errorRecovery: false })(corrupted)).rejects.toThrow();
  }, 240_000);

  test("documents the APNG divergence: pass-through versus silent de-animation", async () => {
    // OptiPNG predates APNG and `-strip all` deletes acTL/fcTL/fdAT,
    // silently flattening animations into static PNGs. The native profile
    // intentionally returns APNG input unchanged instead (ADR 0003).
    const apng = Buffer.from((await readFile(APNG_URL, "utf8")).trim(), "hex");
    expect(pngChunkTypes(apng)).toContain("acTL");

    const ours = await imagemin.buffer(apng, { plugins: [optipng()] });
    expect(Buffer.from(ours).equals(apng)).toBe(true);

    const theirs = await upstreamOptipng()(apng);
    const survivingTypes = pngChunkTypes(theirs);
    expect(survivingTypes).not.toContain("acTL");
    expect(survivingTypes).not.toContain("fcTL");
    expect(survivingTypes).not.toContain("fdAT");
  }, 240_000);

  test("passes non-PNG data through unchanged on both sides", async () => {
    const input = Buffer.from([1, 2, 3]);
    const ours = await imagemin.buffer(input, { plugins: [optipng()] });
    const theirs = await upstreamOptipng()(input);
    expect(Buffer.from(ours).equals(input)).toBe(true);
    expect(Buffer.from(theirs).equals(input)).toBe(true);
  });
});

function corruptIdatCrc(input: Buffer): Buffer {
  const parts: Buffer[] = [input.subarray(0, 8)];
  for (const chunk of pngChunks(input)) {
    const encoded = encodeChunk(chunk.type, Buffer.from(chunk.data));
    if (chunk.type === "IDAT") {
      const crcOffset = encoded.length - 4;
      encoded[crcOffset] = (encoded[crcOffset] ?? 0) ^ 0xff;
    }
    parts.push(encoded);
  }
  return Buffer.concat(parts);
}

function samePixels(left: Rgba64Image, right: Rgba64Image): boolean {
  if (left.width !== right.width || left.height !== right.height) return false;
  if (left.rgba.length !== right.rgba.length) return false;
  for (const [index, value] of left.rgba.entries()) {
    if (value !== right.rgba[index]) return false;
  }
  return true;
}
