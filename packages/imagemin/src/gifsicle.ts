import gifsicleBinary from "gifsicle";

import { runBinary } from "./binary";
import { ImageminError, rethrowIfAborted } from "./errors";
import type { GifsicleOptions, ImageminPlugin } from "./types";

const MAX_GIF_BYTES = 256 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 512 * 1024 * 1024;
const MAX_STDERR_BYTES = 1024 * 1024;
const GIFSICLE_OPTION_NAMES = new Set(["colors", "interlaced", "optimizationLevel"]);

/**
 * Compatibility adapter backed by a separately executed Gifsicle sidecar.
 * The GPL executable is intentionally never linked into the MIT native addon.
 */
export function gifsicle(options: GifsicleOptions = {}): ImageminPlugin {
  const normalized = normalizeGifsicleOptions(options);
  const arguments_ = ["--no-warnings", "--no-app-extensions"];

  if (normalized.interlaced) arguments_.push("--interlace");
  if (normalized.optimizationLevel !== undefined) {
    arguments_.push(`--optimize=${normalized.optimizationLevel}`);
  }
  if (normalized.colors !== undefined) arguments_.push(`--colors=${normalized.colors}`);

  const plugin: ImageminPlugin = async (input, context) => {
    if (!isGif(input)) return input;
    if (input.byteLength > MAX_GIF_BYTES) {
      throw new ImageminError(
        "ERR_IMAGEMIN_INVALID_INPUT",
        `GIF input exceeds the ${MAX_GIF_BYTES} byte limit`,
        { plugin: "gifsicle" },
      );
    }

    try {
      return await runBinary({
        arguments: arguments_,
        binary: gifsicleBinary,
        displayName: "Gifsicle",
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
      throw new ImageminError("ERR_IMAGEMIN_CODEC", "Gifsicle optimization failed", {
        cause,
        plugin: "gifsicle",
      });
    }
  };

  Object.defineProperty(plugin, "name", { value: "gifsicle" });
  return plugin;
}

function isGif(input: Uint8Array): boolean {
  return input.byteLength >= 3 && String.fromCharCode(...input.subarray(0, 3)) === "GIF";
}

function normalizeGifsicleOptions(options: GifsicleOptions): GifsicleOptions {
  for (const optionName of Object.keys(options)) {
    if (!GIFSICLE_OPTION_NAMES.has(optionName)) {
      throw invalidOptions(`Unknown gifsicle option \`${optionName}\``);
    }
  }

  if (options.interlaced !== undefined && typeof options.interlaced !== "boolean") {
    throw invalidOptions("`interlaced` must be a boolean");
  }

  const optimizationLevel = options.optimizationLevel;
  if (
    optimizationLevel !== undefined &&
    (!Number.isInteger(optimizationLevel) || optimizationLevel < 1 || optimizationLevel > 3)
  ) {
    throw invalidOptions("`optimizationLevel` must be an integer between 1 and 3");
  }

  const colors = options.colors;
  if (colors !== undefined && (!Number.isInteger(colors) || colors < 2 || colors > 256)) {
    throw invalidOptions("`colors` must be an integer between 2 and 256");
  }

  return { ...options };
}

function invalidOptions(message: string): ImageminError {
  return new ImageminError("ERR_IMAGEMIN_INVALID_OPTIONS", message, {
    plugin: "gifsicle",
  });
}
