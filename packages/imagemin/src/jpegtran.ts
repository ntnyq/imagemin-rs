import jpegtranBinary from "jpegtran-bin";

import { runBinary } from "./binary";
import { ImageminError, rethrowIfAborted } from "./errors";
import { isJpeg, validateJpegResourceLimits } from "./jpeg";
import type { ImageminPlugin, JpegtranOptions } from "./types";

const MAX_OUTPUT_BYTES = 512 * 1024 * 1024;
const MAX_STDERR_BYTES = 1024 * 1024;
const JPEGTRAN_OPTION_NAMES = new Set(["arithmetic", "progressive"]);

/** Lossless imagemin-jpegtran@8 compatibility adapter. */
export function jpegtran(options: JpegtranOptions = {}): ImageminPlugin {
  const normalized = normalizeJpegtranOptions(options);
  const arguments_ = ["-copy", "none"];

  if (normalized.progressive) arguments_.push("-progressive");
  if (normalized.arithmetic) arguments_.push("-arithmetic");
  else arguments_.push("-optimize");

  const plugin: ImageminPlugin = async (input, context) => {
    if (!isJpeg(input)) return input;
    const dimensions = validateJpegResourceLimits(input, "jpegtran");
    if (dimensions?.width === 0 && dimensions.height === 0) return input;

    try {
      return await runBinary({
        arguments: arguments_,
        binary: jpegtranBinary,
        displayName: "jpegtran",
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
      throw new ImageminError("ERR_IMAGEMIN_CODEC", "jpegtran optimization failed", {
        cause,
        plugin: "jpegtran",
      });
    }
  };

  Object.defineProperty(plugin, "name", { value: "jpegtran" });
  return plugin;
}

function normalizeJpegtranOptions(options: JpegtranOptions): Required<JpegtranOptions> {
  for (const optionName of Object.keys(options)) {
    if (!JPEGTRAN_OPTION_NAMES.has(optionName)) {
      throw invalidOptions(`Unknown jpegtran option \`${optionName}\``);
    }
  }

  const arithmetic = options.arithmetic ?? false;
  const progressive = options.progressive ?? false;
  if (typeof arithmetic !== "boolean") throw invalidOptions("`arithmetic` must be a boolean");
  if (typeof progressive !== "boolean") throw invalidOptions("`progressive` must be a boolean");

  return { arithmetic, progressive };
}

function invalidOptions(message: string): ImageminError {
  return new ImageminError("ERR_IMAGEMIN_INVALID_OPTIONS", message, {
    plugin: "jpegtran",
  });
}
