import { createRequire } from "node:module";

import { runBinary } from "./binary";
import { ImageminError, rethrowIfAborted } from "./errors";
import type { AvifChromaSubsampling, AvifOptions, ImageminPlugin } from "./types";

const MAX_INPUT_BYTES = 256 * 1024 * 1024;
const MAX_INPUT_PIXELS = 67_108_864;
const MAX_DIMENSION = 16_384;
const MAX_METADATA_CHUNK_BYTES = 8 * 1024 * 1024;
const MAX_METADATA_BYTES = 16 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 512 * 1024 * 1024;
const MAX_STDERR_BYTES = 1024 * 1024;
const OPTION_NAMES = new Set([
  "bitdepth",
  "chromaSubsampling",
  "effort",
  "lossless",
  "quality",
  "speed",
]);
const CHROMA_SUBSAMPLING_VALUES = new Set<AvifChromaSubsampling>(["4:2:0", "4:4:4"]);
// Sharp is an optional peer dependency under the L2 distribution model. It is
// resolved only for convertible AVIF input so importing the package and using
// every other plugin never installs or loads Sharp/libvips.
let cachedSharpEntry: string | undefined;

function resolveSharpEntry(): string {
  if (cachedSharpEntry === undefined) {
    try {
      cachedSharpEntry = createRequire(import.meta.url).resolve("sharp");
    } catch (cause) {
      throw new ImageminError(
        "ERR_IMAGEMIN_CODEC",
        "The avif plugin requires the optional peer dependency sharp@0.35.3; install it explicitly with `pnpm add sharp@0.35.3` (or the equivalent command for your package manager)",
        { cause, plugin: "avif" },
      );
    }
  }
  return cachedSharpEntry;
}

const AVIF_WORKER_SOURCE = String.raw`
import { pathToFileURL } from "node:url";

const [sharpPath, optionsJson] = process.argv.slice(1);

try {
  if (sharpPath === undefined || optionsJson === undefined) {
    throw new Error("Missing AVIF worker arguments");
  }
  const sharpModule = await import(pathToFileURL(sharpPath).href);
  const sharp = sharpModule.default;
  sharp.cache(false);
  sharp.concurrency(1);

  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const input = Buffer.concat(chunks);
  const output = await sharp(input, {
    failOn: "warning",
    limitInputPixels: ${MAX_INPUT_PIXELS},
    sequentialRead: true,
  })
    .timeout({ seconds: 180 })
    .avif(JSON.parse(optionsJson))
    .toBuffer();
  process.stdout.write(output);
} catch (error) {
  const name = error instanceof Error ? error.name : "Error";
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(name + ": " + message);
  process.exitCode = 1;
}
`;

type AvifInputKind = "avif" | "gif" | "jpeg" | "png" | "tiff" | "webp";

interface Dimensions {
  height: number;
  width: number;
}

interface InputInfo {
  animated: boolean;
  dimensions?: Dimensions;
}

interface NormalizedAvifOptions {
  bitdepth: 8;
  chromaSubsampling: AvifChromaSubsampling;
  effort?: number;
  lossless: boolean;
  quality: number;
  tune: "ssim";
}

/** Compatibility adapter for imagemin-avif@0.1 backed by isolated Sharp/libheif. */
export function avif(options: AvifOptions = {}): ImageminPlugin {
  const normalized = normalizeAvifOptions(options);
  const workerOptions = JSON.stringify(normalized);

  const plugin: ImageminPlugin = async (input, context) => {
    const kind = detectAvifInputKind(input);
    if (kind === undefined) return input;
    if (!validateAvifInput(input, kind)) return input;
    const sharpEntry = resolveSharpEntry();

    try {
      return await runBinary({
        arguments: [
          "--max-old-space-size=768",
          "--input-type=module",
          "--eval",
          AVIF_WORKER_SOURCE,
          sharpEntry,
          workerOptions,
        ],
        binary: process.execPath,
        displayName: "Sharp AVIF worker",
        input,
        signal: context?.signal,
        limits: {
          outputBytes: MAX_OUTPUT_BYTES,
          stderrBytes: MAX_STDERR_BYTES,
          timeoutMilliseconds: 190_000,
        },
      });
    } catch (cause) {
      rethrowIfAborted(cause);
      throw new ImageminError("ERR_IMAGEMIN_CODEC", "AVIF conversion failed", {
        cause,
        plugin: "avif",
      });
    }
  };

  Object.defineProperty(plugin, "name", { value: "avif" });
  return plugin;
}

function normalizeAvifOptions(options: AvifOptions): NormalizedAvifOptions {
  for (const optionName of Object.keys(options)) {
    if (!OPTION_NAMES.has(optionName)) {
      throw invalidOptions(`Unknown avif option \`${optionName}\``);
    }
  }

  assertIntegerInRange(options.quality, "quality", 1, 100);
  assertIntegerInRange(options.effort, "effort", 0, 9);
  assertIntegerInRange(options.speed, "speed", 0, 8);
  if (options.lossless !== undefined && typeof options.lossless !== "boolean") {
    throw invalidOptions("`lossless` must be a boolean");
  }
  if (
    options.chromaSubsampling !== undefined &&
    !CHROMA_SUBSAMPLING_VALUES.has(options.chromaSubsampling)
  ) {
    throw invalidOptions("`chromaSubsampling` must be 4:2:0 or 4:4:4");
  }
  if (options.bitdepth !== undefined && options.bitdepth !== 8) {
    throw invalidOptions(
      "`bitdepth` must be 8; the prebuilt AVIF runtime does not support 10 or 12",
    );
  }
  if (options.effort !== undefined && options.speed !== undefined) {
    throw invalidOptions("`effort` and `speed` cannot be used together");
  }

  const effort =
    options.effort ??
    (options.speed === undefined ? undefined : Math.round(((8 - options.speed) * 9) / 8));
  return {
    bitdepth: 8,
    chromaSubsampling: options.chromaSubsampling ?? "4:2:0",
    ...(effort === undefined ? {} : { effort }),
    lossless: options.lossless ?? false,
    quality: options.quality ?? 90,
    tune: "ssim",
  };
}

function validateAvifInput(input: Uint8Array, kind: AvifInputKind): boolean {
  if (input.byteLength > MAX_INPUT_BYTES) {
    throw invalidInput(`AVIF input exceeds the ${MAX_INPUT_BYTES} byte limit`);
  }

  validateMetadataLimits(input, kind);
  const info = readInputInfo(input, kind);
  if (info.animated) return false;
  if (info.dimensions !== undefined) {
    const { height, width } = info.dimensions;
    if (
      width === 0 ||
      height === 0 ||
      width > MAX_DIMENSION ||
      height > MAX_DIMENSION ||
      width * height > MAX_INPUT_PIXELS
    ) {
      throw invalidInput(
        `${kind.toUpperCase()} input dimensions exceed the ${MAX_INPUT_PIXELS} pixel limit`,
      );
    }
  }
  return true;
}

function readInputInfo(input: Uint8Array, kind: AvifInputKind): InputInfo {
  if (kind === "png") {
    return {
      animated: containsPngChunk(input, "acTL"),
      ...(input.byteLength < 24
        ? {}
        : { dimensions: { height: readUint32Be(input, 20), width: readUint32Be(input, 16) } }),
    };
  }
  if (kind === "jpeg") {
    const dimensions = readJpegDimensions(input);
    return { animated: false, ...(dimensions === undefined ? {} : { dimensions }) };
  }
  if (kind === "webp") return readWebpInfo(input);
  if (kind === "tiff") return readTiffInfo(input);
  if (kind === "gif") return readGifInfo(input);
  return { animated: containsAvifSequenceBrand(input) };
}

function detectAvifInputKind(input: Uint8Array): AvifInputKind | undefined {
  if (matches(input, 0, [137, 80, 78, 71, 13, 10, 26, 10])) return "png";
  if (matches(input, 0, [255, 216, 255])) return "jpeg";
  if (asciiAt(input, 0, "GIF87a") || asciiAt(input, 0, "GIF89a")) return "gif";
  if (asciiAt(input, 0, "RIFF") && asciiAt(input, 8, "WEBP")) return "webp";
  if (matches(input, 0, [73, 73, 42, 0]) || matches(input, 0, [77, 77, 0, 42])) return "tiff";
  if (hasAvifBrand(input)) return "avif";
  return undefined;
}

function hasAvifBrand(input: Uint8Array): boolean {
  if (!asciiAt(input, 4, "ftyp") || input.byteLength < 16) return false;
  const boxSize = readUint32Be(input, 0);
  const end = boxSize === 0 ? input.byteLength : Math.min(boxSize, input.byteLength);
  if (end < 16) return false;
  for (let position = 8; position + 4 <= end; position += position === 8 ? 8 : 4) {
    if (asciiAt(input, position, "avif") || asciiAt(input, position, "avis")) return true;
  }
  return false;
}

function containsAvifSequenceBrand(input: Uint8Array): boolean {
  if (!asciiAt(input, 4, "ftyp") || input.byteLength < 16) return false;
  const boxSize = readUint32Be(input, 0);
  const end = boxSize === 0 ? input.byteLength : Math.min(boxSize, input.byteLength);
  for (let position = 8; position + 4 <= end; position += position === 8 ? 8 : 4) {
    if (asciiAt(input, position, "avis")) return true;
  }
  return false;
}

function containsPngChunk(input: Uint8Array, expected: string): boolean {
  let position = 8;
  while (position + 12 <= input.byteLength) {
    const length = readUint32Be(input, position);
    const nextPosition = position + 12 + length;
    if (nextPosition > input.byteLength) return false;
    if (asciiAt(input, position + 4, expected)) return true;
    position = nextPosition;
  }
  return false;
}

function readJpegDimensions(input: Uint8Array): Dimensions | undefined {
  let position = 2;
  while (position + 3 < input.byteLength) {
    while (input[position] === 255) position += 1;
    const marker = input[position] ?? 0;
    position += 1;
    if (marker === 217 || marker === 218) return undefined;
    if (marker === 0 || marker === 1 || (marker >= 208 && marker <= 216)) continue;
    if (position + 2 > input.byteLength) return undefined;
    const length = readUint16Be(input, position);
    if (length < 2 || position + length > input.byteLength) return undefined;
    if (isJpegStartOfFrame(marker) && length >= 7) {
      return {
        height: readUint16Be(input, position + 3),
        width: readUint16Be(input, position + 5),
      };
    }
    position += length;
  }
  return undefined;
}

function isJpegStartOfFrame(marker: number): boolean {
  return marker >= 192 && marker <= 207 && marker !== 196 && marker !== 200 && marker !== 204;
}

function readWebpInfo(input: Uint8Array): InputInfo {
  let animated = false;
  let dimensions: Dimensions | undefined;
  let position = 12;

  while (position + 8 <= input.byteLength) {
    const size = readUint32Le(input, position + 4);
    const dataPosition = position + 8;
    const endPosition = dataPosition + size;
    if (endPosition > input.byteLength) break;

    if (asciiAt(input, position, "VP8X") && size >= 10) {
      animated ||= ((input[dataPosition] ?? 0) & 2) !== 0;
      dimensions = {
        height: readUint24Le(input, dataPosition + 7) + 1,
        width: readUint24Le(input, dataPosition + 4) + 1,
      };
    } else if (asciiAt(input, position, "VP8 ") && size >= 10 && dimensions === undefined) {
      if (matches(input, dataPosition + 3, [157, 1, 42])) {
        dimensions = {
          height: readUint16Le(input, dataPosition + 8) & 0x3fff,
          width: readUint16Le(input, dataPosition + 6) & 0x3fff,
        };
      }
    } else if (asciiAt(input, position, "VP8L") && size >= 5 && dimensions === undefined) {
      if (input[dataPosition] === 47) {
        const byte1 = input[dataPosition + 1] ?? 0;
        const byte2 = input[dataPosition + 2] ?? 0;
        const byte3 = input[dataPosition + 3] ?? 0;
        const byte4 = input[dataPosition + 4] ?? 0;
        dimensions = {
          height: 1 + (byte2 >> 6) + (byte3 << 2) + ((byte4 & 15) << 10),
          width: 1 + byte1 + ((byte2 & 63) << 8),
        };
      }
    } else if (asciiAt(input, position, "ANIM") || asciiAt(input, position, "ANMF")) {
      animated = true;
    }
    position = endPosition + (size & 1);
  }
  return { animated, ...(dimensions === undefined ? {} : { dimensions }) };
}

function readTiffInfo(input: Uint8Array): InputInfo {
  const littleEndian = input[0] === 73;
  const read16 = (offset: number) =>
    littleEndian ? readUint16Le(input, offset) : readUint16Be(input, offset);
  const read32 = (offset: number) =>
    littleEndian ? readUint32Le(input, offset) : readUint32Be(input, offset);
  const ifdOffset = read32(4);
  if (ifdOffset + 2 > input.byteLength) return { animated: false };
  const count = read16(ifdOffset);
  if (count > 4096 || ifdOffset + 2 + count * 12 + 4 > input.byteLength) {
    return { animated: false };
  }

  let width: number | undefined;
  let height: number | undefined;
  for (let index = 0; index < count; index += 1) {
    const position = ifdOffset + 2 + index * 12;
    const tag = read16(position);
    if (tag !== 256 && tag !== 257) continue;
    const type = read16(position + 2);
    const valueCount = read32(position + 4);
    if (valueCount !== 1 || (type !== 3 && type !== 4)) continue;
    const value = type === 3 ? read16(position + 8) : read32(position + 8);
    if (tag === 256) width = value;
    else height = value;
  }
  const nextIfd = read32(ifdOffset + 2 + count * 12);
  const dimensions = width === undefined || height === undefined ? undefined : { height, width };
  return {
    animated: nextIfd !== 0,
    ...(dimensions === undefined ? {} : { dimensions }),
  };
}

function readGifInfo(input: Uint8Array): InputInfo {
  const dimensions = { height: readUint16Le(input, 8), width: readUint16Le(input, 6) };
  if (input.byteLength < 13) return { animated: false, dimensions };
  const packed = input[10] ?? 0;
  let position = 13 + ((packed & 128) === 0 ? 0 : 3 * 2 ** ((packed & 7) + 1));
  let frames = 0;

  while (position < input.byteLength) {
    const marker = input[position];
    position += 1;
    if (marker === 59) break;
    if (marker === 33) {
      position += 1;
      position = skipGifSubBlocks(input, position);
    } else if (marker === 44) {
      frames += 1;
      if (frames > 1) return { animated: true, dimensions };
      if (position + 9 > input.byteLength) break;
      const localPacked = input[position + 8] ?? 0;
      position += 9;
      if ((localPacked & 128) !== 0) position += 3 * 2 ** ((localPacked & 7) + 1);
      position += 1;
      position = skipGifSubBlocks(input, position);
    } else {
      break;
    }
  }
  return { animated: false, dimensions };
}

function skipGifSubBlocks(input: Uint8Array, start: number): number {
  let position = start;
  while (position < input.byteLength) {
    const size = input[position] ?? 0;
    position += 1;
    if (size === 0) break;
    position += size;
    if (position > input.byteLength) return input.byteLength;
  }
  return position;
}

function validateMetadataLimits(input: Uint8Array, kind: AvifInputKind): void {
  let total = 0;
  const add = (size: number, label: string) => {
    if (size > MAX_METADATA_CHUNK_BYTES) {
      throw invalidInput(`${label} exceeds the ${MAX_METADATA_CHUNK_BYTES} byte chunk limit`);
    }
    total += size;
    if (total > MAX_METADATA_BYTES) {
      throw invalidInput(`metadata exceeds the ${MAX_METADATA_BYTES} byte total limit`);
    }
  };

  if (kind === "png") {
    let position = 8;
    while (position + 8 <= input.byteLength) {
      const size = readUint32Be(input, position);
      const type = asciiAtAny(input, position + 4, ["eXIf", "iCCP", "iTXt", "tEXt", "zTXt"]);
      if (type !== undefined) add(size, `PNG ${type}`);
      const nextPosition = position + 12 + size;
      if (nextPosition > input.byteLength) break;
      position = nextPosition;
    }
  } else if (kind === "jpeg") {
    let position = 2;
    while (position + 3 < input.byteLength) {
      while (input[position] === 255) position += 1;
      const marker = input[position] ?? 0;
      position += 1;
      if (marker === 217 || marker === 218) break;
      if (marker === 0 || marker === 1 || (marker >= 208 && marker <= 216)) continue;
      if (position + 2 > input.byteLength) break;
      const length = readUint16Be(input, position);
      if (length < 2 || position + length > input.byteLength) break;
      if ((marker >= 224 && marker <= 239) || marker === 254) {
        add(length - 2, `JPEG marker 0x${marker.toString(16)}`);
      }
      position += length;
    }
  } else if (kind === "webp") {
    let position = 12;
    while (position + 8 <= input.byteLength) {
      const size = readUint32Le(input, position + 4);
      const type = asciiAtAny(input, position, ["EXIF", "ICCP", "XMP "]);
      if (type !== undefined) add(size, `WebP ${type}`);
      const endPosition = position + 8 + size;
      if (endPosition > input.byteLength) break;
      position = endPosition + (size & 1);
    }
  } else if (kind === "tiff") {
    validateTiffMetadataLimits(input, add);
  }
}

function validateTiffMetadataLimits(
  input: Uint8Array,
  add: (size: number, label: string) => void,
): void {
  const littleEndian = input[0] === 73;
  const read16 = (offset: number) =>
    littleEndian ? readUint16Le(input, offset) : readUint16Be(input, offset);
  const read32 = (offset: number) =>
    littleEndian ? readUint32Le(input, offset) : readUint32Be(input, offset);
  const ifdOffset = read32(4);
  if (ifdOffset + 2 > input.byteLength) return;
  const count = read16(ifdOffset);
  if (count > 4096 || ifdOffset + 2 + count * 12 + 4 > input.byteLength) return;

  const metadataTags = new Set([700, 33_723, 34_377, 34_675]);
  const typeSizes = new Map([
    [1, 1],
    [2, 1],
    [3, 2],
    [4, 4],
    [5, 8],
    [7, 1],
  ]);
  for (let index = 0; index < count; index += 1) {
    const position = ifdOffset + 2 + index * 12;
    const tag = read16(position);
    if (!metadataTags.has(tag)) continue;
    const elementSize = typeSizes.get(read16(position + 2));
    if (elementSize === undefined) continue;
    add(read32(position + 4) * elementSize, `TIFF tag ${tag}`);
  }
}

function assertIntegerInRange(
  value: number | undefined,
  optionName: string,
  minimum: number,
  maximum: number,
): void {
  if (
    value === undefined ||
    (Number.isSafeInteger(value) && value >= minimum && value <= maximum)
  ) {
    return;
  }
  throw invalidOptions(`\`${optionName}\` must be an integer between ${minimum} and ${maximum}`);
}

function matches(input: Uint8Array, offset: number, signature: readonly number[]): boolean {
  return signature.every((byte, index) => input[offset + index] === byte);
}

function asciiAt(input: Uint8Array, offset: number, expected: string): boolean {
  if (offset + expected.length > input.byteLength) return false;
  return [...expected].every(
    (character, index) => input[offset + index] === character.charCodeAt(0),
  );
}

function asciiAtAny(
  input: Uint8Array,
  offset: number,
  expectedValues: readonly string[],
): string | undefined {
  return expectedValues.find((expected) => asciiAt(input, offset, expected));
}

function readUint16Be(input: Uint8Array, offset: number): number {
  return ((input[offset] ?? 0) << 8) | (input[offset + 1] ?? 0);
}

function readUint16Le(input: Uint8Array, offset: number): number {
  return (input[offset] ?? 0) | ((input[offset + 1] ?? 0) << 8);
}

function readUint24Le(input: Uint8Array, offset: number): number {
  return (input[offset] ?? 0) | ((input[offset + 1] ?? 0) << 8) | ((input[offset + 2] ?? 0) << 16);
}

function readUint32Be(input: Uint8Array, offset: number): number {
  return (
    (((input[offset] ?? 0) << 24) |
      ((input[offset + 1] ?? 0) << 16) |
      ((input[offset + 2] ?? 0) << 8) |
      (input[offset + 3] ?? 0)) >>>
    0
  );
}

function readUint32Le(input: Uint8Array, offset: number): number {
  return (
    ((input[offset] ?? 0) |
      ((input[offset + 1] ?? 0) << 8) |
      ((input[offset + 2] ?? 0) << 16) |
      ((input[offset + 3] ?? 0) << 24)) >>>
    0
  );
}

function invalidInput(message: string): ImageminError {
  return new ImageminError("ERR_IMAGEMIN_INVALID_INPUT", message, { plugin: "avif" });
}

function invalidOptions(message: string): ImageminError {
  return new ImageminError("ERR_IMAGEMIN_INVALID_OPTIONS", message, { plugin: "avif" });
}
