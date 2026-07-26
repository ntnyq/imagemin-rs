import { randomBytes } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import cwebpBinary from "cwebp-bin";

import { runBinary } from "./binary";
import { ImageminError, rethrowIfAborted } from "./errors";
import type {
  ImageminPlugin,
  WebpCropOptions,
  WebpMetadata,
  WebpOptions,
  WebpResizeOptions,
} from "./types";

const MAX_INPUT_BYTES = 256 * 1024 * 1024;
const MAX_DECODED_BYTES = 512 * 1024 * 1024;
const MAX_DIMENSION = 16_383;
const MAX_METADATA_CHUNK_BYTES = 8 * 1024 * 1024;
const MAX_METADATA_BYTES = 16 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 512 * 1024 * 1024;
const MAX_STDERR_BYTES = 1024 * 1024;
const OPTION_NAMES = new Set([
  "alphaQuality",
  "autoFilter",
  "crop",
  "filter",
  "lossless",
  "metadata",
  "method",
  "nearLossless",
  "preset",
  "quality",
  "resize",
  "sharpness",
  "size",
  "sns",
]);
const PRESETS = new Set(["default", "drawing", "icon", "photo", "picture", "text"]);
const METADATA_VALUES = new Set(["all", "exif", "icc", "none", "xmp"]);

type WebpInputKind = "jpeg" | "png" | "tiff" | "webp";

interface Dimensions {
  height: number;
  width: number;
}

interface WebpInputInfo {
  animated: boolean;
  dimensions?: Dimensions;
}

interface TiffInputInfo {
  dimensions?: Dimensions;
  multipage: boolean;
}

/** Compatibility adapter for imagemin-webp@8 backed by cwebp. */
export function webp(options: WebpOptions = {}): ImageminPlugin {
  const normalized = normalizeWebpOptions(options);
  const arguments_ = ["-quiet", "-mt"];

  if (normalized.preset !== undefined) arguments_.push("-preset", normalized.preset);
  if (normalized.quality !== undefined) arguments_.push("-q", String(normalized.quality));
  if (normalized.alphaQuality !== undefined) {
    arguments_.push("-alpha_q", String(normalized.alphaQuality));
  }
  if (normalized.method !== undefined) arguments_.push("-m", String(normalized.method));
  if (normalized.size !== undefined && normalized.size > 0) {
    arguments_.push("-size", String(normalized.size));
  }
  if (normalized.sns !== undefined) arguments_.push("-sns", String(normalized.sns));
  if (normalized.filter !== undefined) arguments_.push("-f", String(normalized.filter));
  if (normalized.autoFilter) arguments_.push("-af");
  if (normalized.sharpness !== undefined) {
    arguments_.push("-sharpness", String(normalized.sharpness));
  }
  if (typeof normalized.lossless === "number") {
    arguments_.push("-z", String(normalized.lossless));
  } else if (normalized.lossless) {
    arguments_.push("-lossless");
  }
  if (normalized.nearLossless !== undefined) {
    arguments_.push("-near_lossless", String(normalized.nearLossless));
  }
  if (normalized.crop !== undefined) {
    const { height, width, x, y } = normalized.crop;
    arguments_.push("-crop", String(x), String(y), String(width), String(height));
  }
  if (normalized.resize !== undefined) {
    arguments_.push("-resize", String(normalized.resize.width), String(normalized.resize.height));
  }
  if (normalized.metadata !== undefined) {
    arguments_.push(
      "-metadata",
      Array.isArray(normalized.metadata) ? normalized.metadata.join(",") : normalized.metadata,
    );
  }

  const plugin: ImageminPlugin = async (input, context) => {
    const kind = detectWebpInputKind(input);
    if (kind === undefined) return input;
    const shouldConvert = validateWebpInput(input, kind);
    if (!shouldConvert) return input;

    try {
      return await runCwebpThroughFiles(arguments_, input, context?.signal);
    } catch (cause) {
      rethrowIfAborted(cause);
      throw new ImageminError("ERR_IMAGEMIN_CODEC", "WebP conversion failed", {
        cause,
        plugin: "webp",
      });
    }
  };

  Object.defineProperty(plugin, "name", { value: "webp" });
  return plugin;
}

// imagemin-webp@8 talks to cwebp through temporary files (exec-buffer), and on
// Windows the vendored cwebp drops metadata chunks when streaming through
// stdin/stdout. Using the same file-based seam keeps the output byte-identical
// with upstream on every platform.
async function runCwebpThroughFiles(
  arguments_: readonly string[],
  input: Uint8Array,
  signal: AbortSignal | undefined,
): Promise<Uint8Array> {
  const token = randomBytes(16).toString("hex");
  const inputPath = join(tmpdir(), `imagemin-rs-cwebp-${token}-in`);
  const outputPath = join(tmpdir(), `imagemin-rs-cwebp-${token}-out`);

  try {
    await writeFile(inputPath, input);
    await runBinary({
      arguments: [...arguments_, "-o", outputPath, "--", inputPath],
      binary: cwebpBinary,
      displayName: "cwebp",
      input: new Uint8Array(0),
      signal,
      limits: {
        outputBytes: MAX_OUTPUT_BYTES,
        stderrBytes: MAX_STDERR_BYTES,
        timeoutMilliseconds: 120_000,
      },
    });
    const output = await readFile(outputPath);
    if (output.byteLength > MAX_OUTPUT_BYTES) {
      throw new Error(`cwebp output exceeds the ${MAX_OUTPUT_BYTES} byte limit`);
    }
    return new Uint8Array(output);
  } finally {
    await Promise.all([rm(inputPath, { force: true }), rm(outputPath, { force: true })]);
  }
}

function normalizeWebpOptions(options: WebpOptions): WebpOptions {
  for (const optionName of Object.keys(options)) {
    if (!OPTION_NAMES.has(optionName)) {
      throw invalidOptions(`Unknown webp option \`${optionName}\``);
    }
  }

  if (options.preset !== undefined && !PRESETS.has(options.preset)) {
    throw invalidOptions("`preset` must be default, photo, picture, drawing, icon, or text");
  }
  assertNumberInRange(options.quality, "quality", 0, 100);
  assertNumberInRange(options.alphaQuality, "alphaQuality", 0, 100);
  assertIntegerInRange(options.method, "method", 0, 6);
  assertIntegerInRange(options.size, "size", 0, Number.MAX_SAFE_INTEGER);
  assertNumberInRange(options.sns, "sns", 0, 100);
  assertNumberInRange(options.filter, "filter", 0, 100);
  if (options.autoFilter !== undefined && typeof options.autoFilter !== "boolean") {
    throw invalidOptions("`autoFilter` must be a boolean");
  }
  assertIntegerInRange(options.sharpness, "sharpness", 0, 7);
  if (
    options.lossless !== undefined &&
    typeof options.lossless !== "boolean" &&
    (!Number.isInteger(options.lossless) || options.lossless < 0 || options.lossless > 9)
  ) {
    throw invalidOptions("`lossless` must be a boolean or an integer between 0 and 9");
  }
  assertNumberInRange(options.nearLossless, "nearLossless", 0, 100);

  const crop = normalizeCrop(options.crop);
  const resize = normalizeResize(options.resize);
  const metadata = normalizeMetadata(options.metadata);

  return {
    ...options,
    ...(crop === undefined ? {} : { crop }),
    ...(metadata === undefined ? {} : { metadata }),
    ...(resize === undefined ? {} : { resize }),
  };
}

function normalizeCrop(crop: WebpCropOptions | undefined): WebpCropOptions | undefined {
  if (crop === undefined) return undefined;
  assertClosedObject(crop, "crop", new Set(["height", "width", "x", "y"]));
  assertIntegerInRange(crop.x, "crop.x", 0, Number.MAX_SAFE_INTEGER);
  assertIntegerInRange(crop.y, "crop.y", 0, Number.MAX_SAFE_INTEGER);
  assertIntegerInRange(crop.width, "crop.width", 1, MAX_DIMENSION);
  assertIntegerInRange(crop.height, "crop.height", 1, MAX_DIMENSION);
  assertOptionPixelBudget(crop.width, crop.height, "crop");
  return { ...crop };
}

function normalizeResize(resize: WebpResizeOptions | undefined): WebpResizeOptions | undefined {
  if (resize === undefined) return undefined;
  assertClosedObject(resize, "resize", new Set(["height", "width"]));
  assertIntegerInRange(resize.width, "resize.width", 0, MAX_DIMENSION);
  assertIntegerInRange(resize.height, "resize.height", 0, MAX_DIMENSION);
  if (resize.width === 0 && resize.height === 0) {
    throw invalidOptions("`resize` width and height cannot both be zero");
  }
  if (resize.width > 0 && resize.height > 0) {
    assertOptionPixelBudget(resize.width, resize.height, "resize");
  }
  return { ...resize };
}

function normalizeMetadata(
  metadata: WebpMetadata | WebpMetadata[] | undefined,
): WebpMetadata | WebpMetadata[] | undefined {
  if (metadata === undefined) return undefined;
  const values = Array.isArray(metadata) ? metadata : [metadata];
  if (values.length === 0 || values.some((value) => !METADATA_VALUES.has(value))) {
    throw invalidOptions("`metadata` must use all, none, exif, icc, or xmp");
  }
  if (values.length > 1 && values.some((value) => value === "all" || value === "none")) {
    throw invalidOptions("`all` and `none` cannot be combined with other metadata values");
  }
  if (new Set(values).size !== values.length) {
    throw invalidOptions("`metadata` values must be unique");
  }
  return Array.isArray(metadata) ? [...values] : values[0];
}

function assertClosedObject(
  value: object,
  optionName: string,
  allowedKeys: ReadonlySet<string>,
): void {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw invalidOptions(`\`${optionName}\` must be an object`);
  }
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) throw invalidOptions(`Unknown ${optionName} option \`${key}\``);
  }
}

function assertNumberInRange(
  value: number | undefined,
  optionName: string,
  minimum: number,
  maximum: number,
): void {
  if (
    value !== undefined &&
    (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum)
  ) {
    throw invalidOptions(`\`${optionName}\` must be a number between ${minimum} and ${maximum}`);
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

function validateWebpInput(input: Uint8Array, kind: WebpInputKind): boolean {
  if (input.byteLength > MAX_INPUT_BYTES) {
    throw new ImageminError(
      "ERR_IMAGEMIN_INVALID_INPUT",
      `WebP input exceeds the ${MAX_INPUT_BYTES} byte limit`,
      { plugin: "webp" },
    );
  }

  validateMetadataLimits(input, kind);

  let dimensions: Dimensions | undefined;
  if (kind === "png") {
    dimensions = readPngDimensions(input);
    if (containsPngChunk(input, "acTL")) return false;
  } else if (kind === "jpeg") {
    dimensions = readJpegDimensions(input);
  } else if (kind === "webp") {
    const info = readWebpInfo(input);
    if (info.animated) return false;
    dimensions = info.dimensions;
  } else {
    const info = readTiffInfo(input);
    if (info.multipage) return false;
    dimensions = info.dimensions;
  }

  if (dimensions !== undefined) {
    assertPixelBudget(dimensions.width, dimensions.height, `${kind.toUpperCase()} input`);
  }
  return true;
}

function assertPixelBudget(width: number, height: number, label: string): void {
  if (width > MAX_DIMENSION || height > MAX_DIMENSION || width * height * 8 > MAX_DECODED_BYTES) {
    throw new ImageminError(
      "ERR_IMAGEMIN_INVALID_INPUT",
      `${label} dimensions exceed the ${MAX_DECODED_BYTES} byte decode limit`,
      { plugin: "webp" },
    );
  }
}

function assertOptionPixelBudget(width: number, height: number, label: string): void {
  if (width * height * 8 > MAX_DECODED_BYTES) {
    throw invalidOptions(`\`${label}\` dimensions exceed the ${MAX_DECODED_BYTES} byte budget`);
  }
}

function validateMetadataLimits(input: Uint8Array, kind: WebpInputKind): void {
  let total = 0;
  const add = (size: number, label: string) => {
    if (size > MAX_METADATA_CHUNK_BYTES) {
      throw metadataLimitError(`${label} exceeds the ${MAX_METADATA_CHUNK_BYTES} byte chunk limit`);
    }
    total += size;
    if (total > MAX_METADATA_BYTES) {
      throw metadataLimitError(`metadata exceeds the ${MAX_METADATA_BYTES} byte total limit`);
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
  } else {
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

function metadataLimitError(message: string): ImageminError {
  return new ImageminError("ERR_IMAGEMIN_INVALID_INPUT", message, { plugin: "webp" });
}

function detectWebpInputKind(input: Uint8Array): WebpInputKind | undefined {
  if (matches(input, 0, [137, 80, 78, 71, 13, 10, 26, 10])) return "png";
  if (matches(input, 0, [255, 216, 255])) return "jpeg";
  if (asciiAt(input, 0, "RIFF") && asciiAt(input, 8, "WEBP")) return "webp";
  if (matches(input, 0, [73, 73, 42, 0]) || matches(input, 0, [77, 77, 0, 42])) return "tiff";
  return undefined;
}

function readPngDimensions(input: Uint8Array): Dimensions | undefined {
  if (input.byteLength < 24) return undefined;
  return { height: readUint32Be(input, 20), width: readUint32Be(input, 16) };
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

function readWebpInfo(input: Uint8Array): WebpInputInfo {
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

function readTiffInfo(input: Uint8Array): TiffInputInfo {
  const littleEndian = input[0] === 73;
  const read16 = (offset: number) =>
    littleEndian ? readUint16Le(input, offset) : readUint16Be(input, offset);
  const read32 = (offset: number) =>
    littleEndian ? readUint32Le(input, offset) : readUint32Be(input, offset);
  const ifdOffset = read32(4);
  if (ifdOffset + 2 > input.byteLength) return { multipage: false };

  const count = read16(ifdOffset);
  if (count > 4096 || ifdOffset + 2 + count * 12 + 4 > input.byteLength) {
    return { multipage: false };
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
    multipage: nextIfd !== 0,
    ...(dimensions === undefined ? {} : { dimensions }),
  };
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

function invalidOptions(message: string): ImageminError {
  return new ImageminError("ERR_IMAGEMIN_INVALID_OPTIONS", message, { plugin: "webp" });
}
