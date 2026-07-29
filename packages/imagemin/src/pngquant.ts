import { BinaryExitError, runBinary } from "./binary";
import { ImageminError, rethrowIfAborted } from "./errors";
import { resolveSidecarBinary } from "./sidecar";
import type { ImageminPlugin, PngquantOptions } from "./types";

const MAX_PNG_BYTES = 256 * 1024 * 1024;
const MAX_DECODED_BYTES = 512 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 512 * 1024 * 1024;
const MAX_STDERR_BYTES = 1024 * 1024;
const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const PNGQUANT_OPTION_NAMES = new Set(["dithering", "posterize", "quality", "speed", "strip"]);

/**
 * Compatibility adapter backed by a separately executed pngquant sidecar.
 * The GPL executable is intentionally never linked into the MIT native addon.
 */
export function pngquant(options: PngquantOptions = {}): ImageminPlugin {
  const normalized = normalizePngquantOptions(options);
  const arguments_ = ["-"];

  if (normalized.speed !== undefined) arguments_.push("--speed", normalized.speed.toString());
  if (normalized.strip) arguments_.push("--strip");
  if (normalized.quality !== undefined) {
    const [minimum, maximum] = normalized.quality;
    arguments_.push("--quality", `${Math.round(minimum * 100)}-${Math.round(maximum * 100)}`);
  }
  if (typeof normalized.dithering === "number") {
    arguments_.push(`--floyd=${normalized.dithering}`);
  } else if (normalized.dithering === false) {
    arguments_.push("--ordered");
  }
  if (normalized.posterize !== undefined) {
    arguments_.push("--posterize", normalized.posterize.toString());
  }

  const plugin: ImageminPlugin = async (input, context) => {
    if (!isPng(input)) return input;
    validateResourceLimits(input);
    // pngquant 3 accepts APNG but silently emits only the default image. A
    // compression plugin must not turn animation into a static image.
    if (containsChunk(input, "acTL")) return input;

    try {
      return await runBinary({
        arguments: arguments_,
        binary: resolveSidecarBinary("pngquant", {
          override: process.env["IMAGEMIN_RS_PNGQUANT_PATH"],
        }),
        displayName: "pngquant",
        input,
        signal: context?.signal,
        limits: {
          outputBytes: MAX_OUTPUT_BYTES,
          stderrBytes: MAX_STDERR_BYTES,
          timeoutMilliseconds: 120_000,
        },
      });
    } catch (cause) {
      rethrowIfAborted(cause);
      if (cause instanceof BinaryExitError && cause.exitCode === 99) return input;
      throw new ImageminError("ERR_IMAGEMIN_CODEC", "pngquant optimization failed", {
        cause,
        plugin: "pngquant",
      });
    }
  };

  Object.defineProperty(plugin, "name", { value: "pngquant" });
  return plugin;
}

function isPng(input: Uint8Array): boolean {
  return PNG_SIGNATURE.every((byte, index) => input[index] === byte);
}

function validateResourceLimits(input: Uint8Array): void {
  if (input.byteLength > MAX_PNG_BYTES) {
    throw new ImageminError(
      "ERR_IMAGEMIN_INVALID_INPUT",
      `PNG input exceeds the ${MAX_PNG_BYTES} byte limit`,
      { plugin: "pngquant" },
    );
  }

  if (input.byteLength >= 24) {
    const width = readUint32Be(input, 16);
    const height = readUint32Be(input, 20);
    if (width * height * 8 > MAX_DECODED_BYTES) {
      throw new ImageminError(
        "ERR_IMAGEMIN_INVALID_INPUT",
        `PNG dimensions exceed the ${MAX_DECODED_BYTES} byte decode limit`,
        { plugin: "pngquant" },
      );
    }
  }
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

function containsChunk(input: Uint8Array, expected: string): boolean {
  let position = PNG_SIGNATURE.byteLength;

  while (position + 12 <= input.byteLength) {
    const length = readUint32Be(input, position);
    const nextPosition = position + 12 + length;
    if (nextPosition > input.byteLength) return false;
    if (
      String.fromCharCode(
        input[position + 4] ?? 0,
        input[position + 5] ?? 0,
        input[position + 6] ?? 0,
        input[position + 7] ?? 0,
      ) === expected
    ) {
      return true;
    }
    position = nextPosition;
  }

  return false;
}

function normalizePngquantOptions(options: PngquantOptions): PngquantOptions {
  for (const optionName of Object.keys(options)) {
    if (!PNGQUANT_OPTION_NAMES.has(optionName)) {
      throw invalidOptions(`Unknown pngquant option \`${optionName}\``);
    }
  }

  const speed = options.speed;
  if (speed !== undefined && (!Number.isInteger(speed) || speed < 1 || speed > 11)) {
    throw invalidOptions("`speed` must be an integer between 1 and 11");
  }

  if (options.strip !== undefined && typeof options.strip !== "boolean") {
    throw invalidOptions("`strip` must be a boolean");
  }

  const quality = options.quality;
  if (
    quality !== undefined &&
    (!Array.isArray(quality) ||
      quality.length !== 2 ||
      quality.some(
        (value) => typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1,
      ))
  ) {
    throw invalidOptions("`quality` must be a two-item tuple with values between 0 and 1");
  }

  const dithering = options.dithering;
  if (
    dithering !== undefined &&
    dithering !== false &&
    (typeof dithering !== "number" || !Number.isFinite(dithering) || dithering < 0 || dithering > 1)
  ) {
    throw invalidOptions("`dithering` must be false or a number between 0 and 1");
  }

  const posterize = options.posterize;
  if (posterize !== undefined && (typeof posterize !== "number" || !Number.isFinite(posterize))) {
    throw invalidOptions("`posterize` must be a finite number");
  }

  return {
    ...(dithering === undefined ? {} : { dithering }),
    ...(posterize === undefined ? {} : { posterize }),
    ...(quality === undefined ? {} : { quality: [...quality] as [number, number] }),
    ...(speed === undefined ? {} : { speed }),
    ...(options.strip === undefined ? {} : { strip: options.strip }),
  };
}

function invalidOptions(message: string): ImageminError {
  return new ImageminError("ERR_IMAGEMIN_INVALID_OPTIONS", message, {
    plugin: "pngquant",
  });
}
