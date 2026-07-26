import mozjpegBinary from "mozjpeg";

import { runBinary } from "./binary";
import { ImageminError, rethrowIfAborted } from "./errors";
import { isJpeg, validateJpegResourceLimits } from "./jpeg";
import type { ImageminPlugin, MozjpegOptions } from "./types";

const MAX_OUTPUT_BYTES = 512 * 1024 * 1024;
const MAX_STDERR_BYTES = 1024 * 1024;
const BOOLEAN_OPTIONS = [
  "arithmetic",
  "fastCrush",
  "overshoot",
  "progressive",
  "quantBaseline",
  "revert",
  "targa",
  "trellis",
  "trellisDC",
] as const;
const DEPRECATED_OPTIONS = new Map([
  ["fastcrush", "fastCrush"],
  ["maxmemory", "maxMemory"],
  ["notrellis", "trellis"],
  ["noovershoot", "overshoot"],
]);
const MOZJPEG_OPTION_NAMES = new Set([
  ...BOOLEAN_OPTIONS,
  "dcScanOpt",
  "dct",
  "maxMemory",
  "quality",
  "quantTable",
  "sample",
  "smooth",
  "tune",
]);
const TUNES = new Set(["hvs-psnr", "ms-ssim", "psnr", "ssim"]);
const DCT_METHODS = new Set(["fast", "float", "int"]);

/** Compatibility adapter for imagemin-mozjpeg@10 backed by cjpeg. */
export function mozjpeg(options: MozjpegOptions = {}): ImageminPlugin {
  const normalized = normalizeMozjpegOptions(options);
  const arguments_: string[] = [];

  if (normalized.quality !== undefined) arguments_.push("-quality", String(normalized.quality));
  if (normalized.progressive === false) arguments_.push("-baseline");
  if (normalized.targa) arguments_.push("-targa");
  if (normalized.revert) arguments_.push("-revert");
  if (normalized.fastCrush) arguments_.push("-fastcrush");
  if (normalized.dcScanOpt !== undefined) {
    arguments_.push("-dc-scan-opt", String(normalized.dcScanOpt));
  }
  if (!normalized.trellis) arguments_.push("-notrellis");
  if (!normalized.trellisDC) arguments_.push("-notrellis-dc");
  if (normalized.tune) arguments_.push(`-tune-${normalized.tune}`);
  if (!normalized.overshoot) arguments_.push("-noovershoot");
  if (normalized.arithmetic) arguments_.push("-arithmetic");
  if (normalized.dct) arguments_.push("-dct", normalized.dct);
  // imagemin-mozjpeg passes a stray boolean argument here. cjpeg expects a
  // flag without a value, so this adapter fixes the upstream unusable option.
  if (normalized.quantBaseline) arguments_.push("-quant-baseline");
  if (normalized.quantTable !== undefined) {
    arguments_.push("-quant-table", String(normalized.quantTable));
  }
  if (normalized.smooth !== undefined) arguments_.push("-smooth", String(normalized.smooth));
  if (normalized.maxMemory !== undefined) {
    arguments_.push("-maxmemory", String(normalized.maxMemory));
  }
  if (normalized.sample !== undefined) arguments_.push("-sample", normalized.sample.join(","));

  const plugin: ImageminPlugin = async (input, context) => {
    if (!isJpeg(input)) return input;
    validateJpegResourceLimits(input, "mozjpeg");

    try {
      return await runBinary({
        arguments: arguments_,
        binary: mozjpegBinary,
        displayName: "MozJPEG cjpeg",
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
      throw new ImageminError("ERR_IMAGEMIN_CODEC", "MozJPEG optimization failed", {
        cause,
        plugin: "mozjpeg",
      });
    }
  };

  Object.defineProperty(plugin, "name", { value: "mozjpeg" });
  return plugin;
}

function normalizeMozjpegOptions(
  options: MozjpegOptions,
): Required<Pick<MozjpegOptions, "overshoot" | "trellis" | "trellisDC">> & MozjpegOptions {
  for (const optionName of Object.keys(options)) {
    const replacement = DEPRECATED_OPTIONS.get(optionName);
    if (replacement) {
      throw invalidOptions(`Option \`${optionName}\` was renamed to \`${replacement}\``);
    }
    if (!MOZJPEG_OPTION_NAMES.has(optionName)) {
      throw invalidOptions(`Unknown mozjpeg option \`${optionName}\``);
    }
  }

  for (const optionName of BOOLEAN_OPTIONS) {
    const value = options[optionName];
    if (value !== undefined && typeof value !== "boolean") {
      throw invalidOptions(`\`${optionName}\` must be a boolean`);
    }
  }

  assertNumberInRange(options.quality, "quality", 0, 100);
  assertIntegerInRange(options.dcScanOpt, "dcScanOpt", 0, 2);
  assertIntegerInRange(options.quantTable, "quantTable", 0, 5);
  assertIntegerInRange(options.smooth, "smooth", 1, 100);
  if (
    options.maxMemory !== undefined &&
    (!Number.isSafeInteger(options.maxMemory) || options.maxMemory < 1)
  ) {
    throw invalidOptions("`maxMemory` must be a positive safe integer");
  }
  if (options.tune !== undefined && !TUNES.has(options.tune)) {
    throw invalidOptions('`tune` must be "psnr", "hvs-psnr", "ssim", or "ms-ssim"');
  }
  if (options.dct !== undefined && !DCT_METHODS.has(options.dct)) {
    throw invalidOptions('`dct` must be "int", "fast", or "float"');
  }
  if (
    options.sample !== undefined &&
    (!Array.isArray(options.sample) ||
      options.sample.length === 0 ||
      options.sample.some((factor) => typeof factor !== "string" || !/^[1-4]x[1-4]$/.test(factor)))
  ) {
    throw invalidOptions('`sample` must contain factors such as "2x2" and "1x1"');
  }

  return {
    ...options,
    overshoot: options.overshoot ?? true,
    trellis: options.trellis ?? true,
    trellisDC: options.trellisDC ?? true,
    ...(options.sample === undefined ? {} : { sample: [...options.sample] }),
  };
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
  if (value !== undefined && (!Number.isInteger(value) || value < minimum || value > maximum)) {
    throw invalidOptions(`\`${optionName}\` must be an integer between ${minimum} and ${maximum}`);
  }
}

function invalidOptions(message: string): ImageminError {
  return new ImageminError("ERR_IMAGEMIN_INVALID_OPTIONS", message, {
    plugin: "mozjpeg",
  });
}
