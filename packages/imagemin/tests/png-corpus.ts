import { Buffer } from "node:buffer";
import { deflateSync, inflateSync } from "node:zlib";

// Deterministic PNG corpus toolkit for the OptiPNG differential: a scratch
// encoder covering every color type and bit depth, chunk-level inspection,
// and a spec-exact RGBA64 decoder (all bit depths, tRNS, Adam7) so pixel
// comparisons never depend on a codec library's color management.

export type PngColorType = 0 | 2 | 3 | 4 | 6;
export type PngBitDepth = 1 | 2 | 4 | 8 | 16;

export interface PngChunkSpec {
  data: Uint8Array;
  type: string;
}

export interface EncodePngSpec {
  bitDepth: PngBitDepth;
  colorType: PngColorType;
  /** Ancillary chunks inserted between PLTE and IDAT. */
  extraChunks?: readonly PngChunkSpec[];
  height: number;
  palette?: readonly (readonly [number, number, number])[];
  /**
   * Samples for one pixel in channel order (gray | r,g,b | palette index |
   * gray,alpha | r,g,b,alpha), each within the bit-depth sample range.
   */
  pixel: (x: number, y: number) => readonly number[];
  /**
   * tRNS payload samples: per-index alpha (0..255) for palette images, or
   * one gray / three RGB bit-depth samples for truecolor images.
   */
  transparency?: readonly number[];
  width: number;
}

const CHANNELS_BY_COLOR_TYPE: Record<PngColorType, number> = {
  0: 1,
  2: 3,
  3: 1,
  4: 2,
  6: 4,
};

/** Exact 16-bit expansion factors: 65535 / (2^bitDepth - 1). */
const SAMPLE_SCALE: Record<PngBitDepth, number> = {
  1: 65_535,
  2: 21_845,
  4: 4369,
  8: 257,
  16: 1,
};

const ADAM7_PASSES = [
  { dx: 8, dy: 8, x0: 0, y0: 0 },
  { dx: 8, dy: 8, x0: 4, y0: 0 },
  { dx: 4, dy: 8, x0: 0, y0: 4 },
  { dx: 4, dy: 4, x0: 2, y0: 0 },
  { dx: 2, dy: 4, x0: 0, y0: 2 },
  { dx: 2, dy: 2, x0: 1, y0: 0 },
  { dx: 1, dy: 2, x0: 0, y0: 1 },
] as const;

const PNG_SIGNATURE = Buffer.from("89504e470d0a1a0a", "hex");

export function encodePng(spec: EncodePngSpec): Buffer {
  const channels = CHANNELS_BY_COLOR_TYPE[spec.colorType];
  const bitsPerPixel = channels * spec.bitDepth;
  const rowBytes = Math.ceil((spec.width * bitsPerPixel) / 8);
  const raw = Buffer.alloc(spec.height * (rowBytes + 1));

  for (let y = 0; y < spec.height; y += 1) {
    const rowOffset = y * (rowBytes + 1) + 1;
    let bitCursor = 0;
    for (let x = 0; x < spec.width; x += 1) {
      const samples = spec.pixel(x, y);
      if (samples.length !== channels) {
        throw new Error(`Expected ${channels} samples at (${x}, ${y}), got ${samples.length}`);
      }
      for (const sample of samples) {
        if (!Number.isInteger(sample) || sample < 0 || sample >= 2 ** spec.bitDepth) {
          throw new Error(`Sample ${sample} at (${x}, ${y}) exceeds bit depth ${spec.bitDepth}`);
        }
        if (spec.bitDepth === 16) {
          raw.writeUInt16BE(sample, rowOffset + bitCursor / 8);
          bitCursor += 16;
        } else if (spec.bitDepth === 8) {
          raw[rowOffset + bitCursor / 8] = sample;
          bitCursor += 8;
        } else {
          const byteIndex = rowOffset + Math.floor(bitCursor / 8);
          const shift = 8 - spec.bitDepth - (bitCursor % 8);
          raw[byteIndex] = (raw[byteIndex] ?? 0) | (sample << shift);
          bitCursor += spec.bitDepth;
        }
      }
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(spec.width, 0);
  ihdr.writeUInt32BE(spec.height, 4);
  ihdr[8] = spec.bitDepth;
  ihdr[9] = spec.colorType;

  const chunks: Buffer[] = [PNG_SIGNATURE, encodeChunk("IHDR", ihdr)];
  if (spec.palette !== undefined) {
    const plte = Buffer.alloc(spec.palette.length * 3);
    for (const [index, [red, green, blue]] of spec.palette.entries()) {
      plte[index * 3] = red;
      plte[index * 3 + 1] = green;
      plte[index * 3 + 2] = blue;
    }
    chunks.push(encodeChunk("PLTE", plte));
  }
  if (spec.transparency !== undefined) {
    const wide = spec.colorType === 0 || spec.colorType === 2;
    const trns = Buffer.alloc(spec.transparency.length * (wide ? 2 : 1));
    for (const [index, value] of spec.transparency.entries()) {
      if (wide) trns.writeUInt16BE(value, index * 2);
      else trns[index] = value;
    }
    chunks.push(encodeChunk("tRNS", trns));
  }
  for (const chunk of spec.extraChunks ?? []) {
    chunks.push(encodeChunk(chunk.type, Buffer.from(chunk.data)));
  }
  chunks.push(encodeChunk("IDAT", deflateSync(raw)), encodeChunk("IEND", Buffer.alloc(0)));

  return Buffer.concat(chunks);
}

export function encodeChunk(type: string, data: Buffer): Buffer {
  const chunk = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write(type, 4, "latin1");
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + data.length)), 8 + data.length);
  return chunk;
}

export interface PngChunk {
  data: Uint8Array;
  type: string;
}

export function pngChunks(input: Uint8Array): PngChunk[] {
  const data = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  if (!data.subarray(0, 8).equals(PNG_SIGNATURE)) throw new TypeError("Expected PNG data");
  const chunks: PngChunk[] = [];
  let offset = 8;
  while (offset + 12 <= data.length) {
    const length = data.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > data.length) throw new Error("Truncated PNG chunk");
    chunks.push({
      data: data.subarray(offset + 8, offset + 8 + length),
      type: data.subarray(offset + 4, offset + 8).toString("latin1"),
    });
    if (chunks.at(-1)?.type === "IEND") break;
    offset = end;
  }
  return chunks;
}

export function pngChunkTypes(input: Uint8Array): string[] {
  return [...new Set(pngChunks(input).map((chunk) => chunk.type))];
}

export interface PngHeader {
  bitDepth: number;
  colorType: number;
  height: number;
  interlace: number;
  width: number;
}

export function pngHeader(input: Uint8Array): PngHeader {
  const ihdr = pngChunks(input).find((chunk) => chunk.type === "IHDR");
  if (ihdr === undefined || ihdr.data.length < 13) throw new Error("Missing IHDR chunk");
  const data = Buffer.from(ihdr.data.buffer, ihdr.data.byteOffset, ihdr.data.byteLength);
  return {
    bitDepth: data[8] ?? 0,
    colorType: data[9] ?? 0,
    height: data.readUInt32BE(4),
    interlace: data[12] ?? 0,
    width: data.readUInt32BE(0),
  };
}

export interface Rgba64Image {
  height: number;
  rgba: Uint16Array;
  width: number;
}

/**
 * Decodes any non-animated PNG to canonical RGBA64. Low bit depths are
 * expanded with the exact PNG factors (65535 / (2^depth - 1)), so lossless
 * bit-depth, color-type, or palette changes decode to identical pixels.
 */
export function decodeRgba64(input: Uint8Array): Rgba64Image {
  const chunks = pngChunks(input);
  const header = pngHeader(input);
  const colorType = header.colorType as PngColorType;
  const bitDepth = header.bitDepth as PngBitDepth;
  const channels = CHANNELS_BY_COLOR_TYPE[colorType];
  if (channels === undefined || SAMPLE_SCALE[bitDepth] === undefined) {
    throw new Error(`Unsupported PNG layout: type=${header.colorType} depth=${header.bitDepth}`);
  }

  const paletteChunk = chunks.find((chunk) => chunk.type === "PLTE")?.data;
  const transparencyChunk = chunks.find((chunk) => chunk.type === "tRNS")?.data;
  const raw = inflateSync(
    Buffer.concat(chunks.filter((chunk) => chunk.type === "IDAT").map((chunk) => chunk.data)),
  );

  const context: SampleContext = {
    bitDepth,
    colorType,
    ...(paletteChunk === undefined ? {} : { palette: Buffer.from(paletteChunk) }),
    ...(transparencyChunk === undefined ? {} : { transparency: Buffer.from(transparencyChunk) }),
  };
  const rgba = new Uint16Array(header.width * header.height * 4);
  const passes = header.interlace === 1 ? ADAM7_PASSES : [{ dx: 1, dy: 1, x0: 0, y0: 0 } as const];

  let offset = 0;
  for (const pass of passes) {
    const passWidth = Math.ceil((header.width - pass.x0) / pass.dx);
    const passHeight = Math.ceil((header.height - pass.y0) / pass.dy);
    if (passWidth <= 0 || passHeight <= 0) continue;
    offset = decodeSubImage(raw, offset, passWidth, passHeight, context, (x, y, samples) => {
      const pixelOffset = ((pass.y0 + y * pass.dy) * header.width + pass.x0 + x * pass.dx) * 4;
      const [red, green, blue, alpha] = samplesToRgba64(samples, context);
      rgba[pixelOffset] = red;
      rgba[pixelOffset + 1] = green;
      rgba[pixelOffset + 2] = blue;
      rgba[pixelOffset + 3] = alpha;
    });
  }
  if (offset !== raw.length) {
    throw new Error(`Unexpected PNG data size: consumed ${offset} of ${raw.length}`);
  }

  return { height: header.height, rgba, width: header.width };
}

interface SampleContext {
  bitDepth: PngBitDepth;
  colorType: PngColorType;
  palette?: Buffer;
  transparency?: Buffer;
}

function decodeSubImage(
  raw: Buffer,
  startOffset: number,
  width: number,
  height: number,
  context: SampleContext,
  emit: (x: number, y: number, samples: readonly number[]) => void,
): number {
  const channels = CHANNELS_BY_COLOR_TYPE[context.colorType];
  const bitsPerPixel = channels * context.bitDepth;
  const rowBytes = Math.ceil((width * bitsPerPixel) / 8);
  const filterUnit = Math.max(1, Math.ceil(bitsPerPixel / 8));
  const previousRow = Buffer.alloc(rowBytes);
  const currentRow = Buffer.alloc(rowBytes);
  let offset = startOffset;

  for (let y = 0; y < height; y += 1) {
    const filter = raw[offset] ?? 0;
    offset += 1;
    if (offset + rowBytes > raw.length) throw new Error("Truncated PNG scanline");

    for (let index = 0; index < rowBytes; index += 1) {
      const value = raw[offset + index] ?? 0;
      const left = index >= filterUnit ? (currentRow[index - filterUnit] ?? 0) : 0;
      const above = previousRow[index] ?? 0;
      const upperLeft = index >= filterUnit ? (previousRow[index - filterUnit] ?? 0) : 0;
      currentRow[index] = (value + filterPredictor(filter, left, above, upperLeft)) & 0xff;
    }
    offset += rowBytes;

    for (let x = 0; x < width; x += 1) {
      const samples: number[] = [];
      for (let channel = 0; channel < channels; channel += 1) {
        const bitCursor = (x * channels + channel) * context.bitDepth;
        if (context.bitDepth === 16) {
          samples.push(currentRow.readUInt16BE(bitCursor / 8));
        } else if (context.bitDepth === 8) {
          samples.push(currentRow[bitCursor / 8] ?? 0);
        } else {
          const byte = currentRow[Math.floor(bitCursor / 8)] ?? 0;
          const shift = 8 - context.bitDepth - (bitCursor % 8);
          samples.push((byte >> shift) & ((1 << context.bitDepth) - 1));
        }
      }
      emit(x, y, samples);
    }
    currentRow.copy(previousRow);
  }

  return offset;
}

function filterPredictor(filter: number, left: number, above: number, upperLeft: number): number {
  switch (filter) {
    case 0:
      return 0;
    case 1:
      return left;
    case 2:
      return above;
    case 3:
      return Math.floor((left + above) / 2);
    case 4: {
      const prediction = left + above - upperLeft;
      const leftDistance = Math.abs(prediction - left);
      const aboveDistance = Math.abs(prediction - above);
      const upperLeftDistance = Math.abs(prediction - upperLeft);
      if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
      if (aboveDistance <= upperLeftDistance) return above;
      return upperLeft;
    }
    default:
      throw new Error(`Unsupported PNG row filter ${filter}`);
  }
}

function samplesToRgba64(
  samples: readonly number[],
  context: SampleContext,
): [number, number, number, number] {
  const scale = SAMPLE_SCALE[context.bitDepth];
  switch (context.colorType) {
    case 0: {
      const gray = samples[0] ?? 0;
      const alpha =
        context.transparency !== undefined && context.transparency.readUInt16BE(0) === gray
          ? 0
          : 65_535;
      return [gray * scale, gray * scale, gray * scale, alpha];
    }
    case 2: {
      const [red = 0, green = 0, blue = 0] = samples;
      const alpha =
        context.transparency !== undefined &&
        context.transparency.readUInt16BE(0) === red &&
        context.transparency.readUInt16BE(2) === green &&
        context.transparency.readUInt16BE(4) === blue
          ? 0
          : 65_535;
      return [red * scale, green * scale, blue * scale, alpha];
    }
    case 3: {
      const index = samples[0] ?? 0;
      const palette = context.palette;
      if (palette === undefined || index * 3 + 2 >= palette.length) {
        throw new Error(`PNG palette index ${index} is out of range`);
      }
      const alpha = context.transparency?.[index] ?? 255;
      return [
        (palette[index * 3] ?? 0) * 257,
        (palette[index * 3 + 1] ?? 0) * 257,
        (palette[index * 3 + 2] ?? 0) * 257,
        alpha * 257,
      ];
    }
    case 4: {
      const [gray = 0, alpha = 0] = samples;
      return [gray * scale, gray * scale, gray * scale, alpha * scale];
    }
    default: {
      const [red = 0, green = 0, blue = 0, alpha = 0] = samples;
      return [red * scale, green * scale, blue * scale, alpha * scale];
    }
  }
}

export function crc32(data: Uint8Array): number {
  let crc = 0xff_ff_ff_ff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xed_b8_83_20 & -(crc & 1));
    }
  }
  return (crc ^ 0xff_ff_ff_ff) >>> 0;
}

/** Deterministic 32-bit LCG so corpus pixels are identical on every platform. */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state;
  };
}

export function textChunk(keyword: string, text: string): PngChunkSpec {
  return { data: Buffer.from(`${keyword}\0${text}`, "latin1"), type: "tEXt" };
}

export function compressedTextChunk(keyword: string, text: string): PngChunkSpec {
  return {
    data: Buffer.concat([
      Buffer.from(`${keyword}\0\0`, "latin1"),
      deflateSync(Buffer.from(text, "latin1")),
    ]),
    type: "zTXt",
  };
}

export function internationalTextChunk(keyword: string, text: string): PngChunkSpec {
  return {
    data: Buffer.from(`${keyword}\0\0\0zh-CN\0${keyword}\0${text}`, "utf8"),
    type: "iTXt",
  };
}

export interface CorpusEntry {
  bytes: Buffer;
  name: string;
  /** Expected pixels computed directly from the spec, bypassing the encoder. */
  rgba: Rgba64Image;
}

function corpusEntry(name: string, spec: EncodePngSpec): CorpusEntry {
  const context: SampleContext = {
    bitDepth: spec.bitDepth,
    colorType: spec.colorType,
    ...(spec.palette === undefined
      ? {}
      : { palette: Buffer.from(spec.palette.flatMap((entry) => [...entry])) }),
    ...(spec.transparency === undefined
      ? {}
      : {
          transparency:
            spec.colorType === 0 || spec.colorType === 2
              ? bigEndianSamples(spec.transparency)
              : Buffer.from(spec.transparency),
        }),
  };
  const rgba = new Uint16Array(spec.width * spec.height * 4);
  for (let y = 0; y < spec.height; y += 1) {
    for (let x = 0; x < spec.width; x += 1) {
      const [red, green, blue, alpha] = samplesToRgba64(spec.pixel(x, y), context);
      const offset = (y * spec.width + x) * 4;
      rgba[offset] = red;
      rgba[offset + 1] = green;
      rgba[offset + 2] = blue;
      rgba[offset + 3] = alpha;
    }
  }

  return {
    bytes: encodePng(spec),
    name,
    rgba: { height: spec.height, rgba, width: spec.width },
  };
}

function bigEndianSamples(values: readonly number[]): Buffer {
  const buffer = Buffer.alloc(values.length * 2);
  for (const [index, value] of values.entries()) buffer.writeUInt16BE(value, index * 2);
  return buffer;
}

/**
 * Synthetic PNG corpus for the OptiPNG 0.7.x differential: every color type,
 * bit depths 1..16, reducible and irreducible content, transparency in every
 * representation, odd geometry and a metadata-heavy profile.
 */
export function buildOptipngCorpus(): CorpusEntry[] {
  const gradient16 = (x: number, y: number): number =>
    ((x * 2_654_435_761 + y * 40_503) >>> 8) & 0xff_ff;
  const noise = createRandom(0x5ee_d);
  const noisePixels: number[][] = [];
  for (let index = 0; index < 48 * 32; index += 1) {
    noisePixels.push([noise() & 0xff, noise() & 0xff, noise() & 0xff]);
  }

  const palette16: (readonly [number, number, number])[] = [];
  const paletteRandom = createRandom(0xbeef);
  for (let index = 0; index < 16; index += 1) {
    palette16.push([paletteRandom() & 0xff, paletteRandom() & 0xff, paletteRandom() & 0xff]);
  }
  const palette200: (readonly [number, number, number])[] = [];
  const palette200Random = createRandom(0xcafe);
  for (let index = 0; index < 200; index += 1) {
    palette200.push([
      palette200Random() & 0xff,
      palette200Random() & 0xff,
      palette200Random() & 0xff,
    ]);
  }

  return [
    corpusEntry("gray-1bit-checker-15x9", {
      bitDepth: 1,
      colorType: 0,
      height: 9,
      pixel: (x, y) => [(x + y) % 2],
      width: 15,
    }),
    corpusEntry("gray-2bit-bands-16x10", {
      bitDepth: 2,
      colorType: 0,
      height: 10,
      pixel: (x) => [Math.floor(x / 4) % 4],
      width: 16,
    }),
    corpusEntry("gray-4bit-diagonal-9x7", {
      bitDepth: 4,
      colorType: 0,
      height: 7,
      pixel: (x, y) => [(x + 2 * y) % 16],
      width: 9,
    }),
    corpusEntry("gray-8bit-gradient-32x24", {
      bitDepth: 8,
      colorType: 0,
      height: 24,
      pixel: (x, y) => [(x * 8 + y) & 0xff],
      width: 32,
    }),
    corpusEntry("gray-8bit-binary-16x16", {
      bitDepth: 8,
      colorType: 0,
      height: 16,
      pixel: (x, y) => [(x ^ y) % 3 === 0 ? 255 : 0],
      width: 16,
    }),
    corpusEntry("gray-16bit-reducible-12x8", {
      bitDepth: 16,
      colorType: 0,
      height: 8,
      pixel: (x, y) => [((x * 16 + y * 24) & 0xff) * 257],
      width: 12,
    }),
    corpusEntry("gray-16bit-full-12x8", {
      bitDepth: 16,
      colorType: 0,
      height: 8,
      pixel: (x, y) => [gradient16(x, y)],
      width: 12,
    }),
    corpusEntry("gray-alpha-8bit-gradient-20x12", {
      bitDepth: 8,
      colorType: 4,
      height: 12,
      pixel: (x, y) => [(x * 12) & 0xff, (y * 21 + 3) & 0xff],
      width: 20,
    }),
    corpusEntry("gray-alpha-8bit-opaque-16x8", {
      bitDepth: 8,
      colorType: 4,
      height: 8,
      pixel: (x, y) => [(x * 16 + y) & 0xff, 255],
      width: 16,
    }),
    corpusEntry("gray-alpha-16bit-8x8", {
      bitDepth: 16,
      colorType: 4,
      height: 8,
      pixel: (x, y) => [gradient16(x, y), gradient16(y + 3, x + 7)],
      width: 8,
    }),
    corpusEntry("rgb-8bit-gradient-32x24", {
      bitDepth: 8,
      colorType: 2,
      height: 24,
      pixel: (x, y) => [(x * 8) & 0xff, (y * 10) & 0xff, (x * 3 + y * 5) & 0xff],
      width: 32,
    }),
    corpusEntry("rgb-8bit-few-colors-24x16", {
      bitDepth: 8,
      colorType: 2,
      height: 16,
      pixel: (x, y) => {
        const bucket = (Math.floor(x / 6) + Math.floor(y / 4) * 4) % 8;
        return [bucket * 32, 255 - bucket * 24, (bucket * 77) & 0xff];
      },
      width: 24,
    }),
    corpusEntry("rgb-8bit-gray-values-16x16", {
      bitDepth: 8,
      colorType: 2,
      height: 16,
      pixel: (x, y) => {
        const value = (x * 16 + y) & 0xff;
        return [value, value, value];
      },
      width: 16,
    }),
    corpusEntry("rgb-16bit-reducible-10x6", {
      bitDepth: 16,
      colorType: 2,
      height: 6,
      pixel: (x, y) => [((x * 25) & 0xff) * 257, ((y * 42) & 0xff) * 257, ((x + y) & 0xff) * 257],
      width: 10,
    }),
    corpusEntry("rgb-8bit-noise-48x32", {
      bitDepth: 8,
      colorType: 2,
      height: 32,
      pixel: (x, y) => noisePixels[y * 48 + x] ?? [0, 0, 0],
      width: 48,
    }),
    corpusEntry("palette-1bit-two-colors-16x8", {
      bitDepth: 1,
      colorType: 3,
      height: 8,
      palette: [
        [0, 0, 0],
        [255, 255, 255],
      ],
      pixel: (x, y) => [(x + y) % 2],
      width: 16,
    }),
    corpusEntry("palette-2bit-four-colors-12x12", {
      bitDepth: 2,
      colorType: 3,
      height: 12,
      palette: [
        [255, 0, 0],
        [0, 255, 0],
        [0, 0, 255],
        [255, 255, 0],
      ],
      pixel: (x, y) => [(x + y) % 4],
      width: 12,
    }),
    corpusEntry("palette-4bit-alpha-20x14", {
      bitDepth: 4,
      colorType: 3,
      height: 14,
      palette: palette16.slice(0, 12),
      pixel: (x, y) => [(x + y * 3) % 12],
      transparency: [0, 64, 128, 192, 255, 255, 255, 255, 255, 255, 255, 255],
      width: 20,
    }),
    corpusEntry("palette-8bit-200-colors-40x30", {
      bitDepth: 8,
      colorType: 3,
      height: 30,
      palette: palette200,
      pixel: (x, y) => [(x * 7 + y * 13) % 200],
      width: 40,
    }),
    corpusEntry("rgba-8bit-alpha-gradient-24x16", {
      bitDepth: 8,
      colorType: 6,
      height: 16,
      pixel: (x, y) => [(x * 10) & 0xff, (y * 16) & 0xff, 128, (x * 11 + y) & 0xff],
      width: 24,
    }),
    corpusEntry("rgba-8bit-opaque-24x16", {
      bitDepth: 8,
      colorType: 6,
      height: 16,
      pixel: (x, y) => [(x * 10) & 0xff, (y * 16) & 0xff, (x ^ y) & 0xff, 255],
      width: 24,
    }),
    corpusEntry("rgba-8bit-single-transparent-color-16x16", {
      bitDepth: 8,
      colorType: 6,
      height: 16,
      pixel: (x, y) =>
        (x === 0 && y === 0) || (x > 4 && x < 8 && y > 4 && y < 8)
          ? [1, 2, 3, 0]
          : [(x * 16) & 0xff, (y * 16) & 0xff, 200, 255],
      width: 16,
    }),
    corpusEntry("rgba-16bit-8x8", {
      bitDepth: 16,
      colorType: 6,
      height: 8,
      pixel: (x, y) => [
        gradient16(x, y),
        gradient16(x + 1, y),
        gradient16(x, y + 1),
        gradient16(x + 5, y + 5),
      ],
      width: 8,
    }),
    corpusEntry("rgba-8bit-solid-64x48", {
      bitDepth: 8,
      colorType: 6,
      height: 48,
      pixel: () => [30, 144, 255, 255],
      width: 64,
    }),
    corpusEntry("gray-8bit-tall-1x64", {
      bitDepth: 8,
      colorType: 0,
      height: 64,
      pixel: (_x, y) => [(y * 4) & 0xff],
      width: 1,
    }),
    corpusEntry("rgb-8bit-wide-64x1", {
      bitDepth: 8,
      colorType: 2,
      height: 1,
      pixel: (x) => [(x * 4) & 0xff, 255 - ((x * 4) & 0xff), 77],
      width: 64,
    }),
    corpusEntry("gray-8bit-one-pixel", {
      bitDepth: 8,
      colorType: 0,
      height: 1,
      pixel: () => [137],
      width: 1,
    }),
    corpusEntry("rgb-8bit-metadata-laden-32x24", {
      bitDepth: 8,
      colorType: 2,
      extraChunks: [
        { data: new Uint8Array([0, 0, 0xb1, 0x8f]), type: "gAMA" },
        { data: new Uint8Array([0]), type: "sRGB" },
        {
          data: new Uint8Array([0, 0, 0x2e, 0x23, 0, 0, 0x2e, 0x23, 1]),
          type: "pHYs",
        },
        { data: new Uint8Array([0x12, 0x34, 0x00, 0x40, 0xab, 0xcd]), type: "bKGD" },
        { data: new Uint8Array([7, 0xe2, 3, 14, 9, 26, 53]), type: "tIME" },
        textChunk("Title", "imagemin-rs corpus"),
        textChunk("Author", "generated"),
        compressedTextChunk("Description", "deterministic OptiPNG differential entry"),
        internationalTextChunk("Comment", "元数据剥离差分样本"),
        { data: Buffer.from("private payload", "latin1"), type: "prVt" },
      ],
      height: 24,
      pixel: (x, y) => [(x * 8) & 0xff, (y * 10) & 0xff, (x * 3 + y * 5) & 0xff],
      width: 32,
    }),
  ];
}
