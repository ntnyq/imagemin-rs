import { ImageminError, throwIfAborted, toImageminError, withAbortSignal } from "./errors";
import { runWasmPlugins } from "./native";
import { getWasmDescriptor } from "./plugins";
import type {
  ImageminPlugin,
  OptimizationResult,
  OptimizationStep,
  OptimizeOptions,
} from "./types";

const MAX_IMAGE_INPUT_BYTES = 256 * 1024 * 1024;

export async function optimize(
  input: Uint8Array,
  options: OptimizeOptions = {},
): Promise<OptimizationResult> {
  if (!(input instanceof Uint8Array)) {
    throw new ImageminError(
      "ERR_IMAGEMIN_INVALID_INPUT",
      "Expected image input to be a Uint8Array",
    );
  }
  if (input.byteLength > MAX_IMAGE_INPUT_BYTES) {
    throw new ImageminError(
      "ERR_IMAGEMIN_INVALID_INPUT",
      `Image input exceeds the ${MAX_IMAGE_INPUT_BYTES} byte limit`,
    );
  }
  if (options === null || typeof options !== "object") {
    throw new ImageminError("ERR_IMAGEMIN_INVALID_OPTIONS", "Expected options to be an object");
  }

  const inputBytes = input.byteLength;
  const plugins = normalizePlugins(options.plugins);
  const signal = normalizeSignal(options.signal);
  const steps: OptimizationStep[] = [];
  let current: Uint8Array = new Uint8Array(input);
  let index = 0;

  throwIfAborted(signal);

  while (index < plugins.length) {
    throwIfAborted(signal);
    const plugin = plugins[index];
    if (plugin === undefined) break;

    const descriptor = getWasmDescriptor(plugin);
    if (descriptor !== undefined) {
      const descriptors = [descriptor];
      index += 1;

      while (index < plugins.length) {
        const nextPlugin = plugins[index];
        if (nextPlugin === undefined) break;

        const nextDescriptor = getWasmDescriptor(nextPlugin);
        if (nextDescriptor === undefined) break;

        descriptors.push(nextDescriptor);
        index += 1;
      }

      const result = await withAbortSignal(runWasmPlugins(current, descriptors), signal, {
        plugin: descriptors[0]?.name,
      });
      current = result.data;
      steps.push(...result.steps);
      continue;
    }

    const pluginInput = current;
    current = await runBrowserPlugin(pluginInput, plugin, index, signal);
    steps.push({
      changed: !bytesEqual(pluginInput, current),
      inputBytes: pluginInput.byteLength,
      outputBytes: current.byteLength,
      plugin: plugin.name || `plugin-${index}`,
    });
    index += 1;
  }

  return {
    data: current,
    format: detectImageFormat(current),
    inputBytes,
    outputBytes: current.byteLength,
    steps,
  };
}

async function runBrowserPlugin(
  input: Uint8Array,
  plugin: ImageminPlugin,
  pluginIndex: number,
  signal: AbortSignal | undefined,
): Promise<Uint8Array> {
  try {
    const output = await withAbortSignal(
      Promise.resolve().then(() =>
        plugin(new Uint8Array(input), signal === undefined ? undefined : { signal }),
      ),
      signal,
      { plugin: plugin.name || undefined },
    );
    if (!(output instanceof Uint8Array)) {
      throw new ImageminError(
        "ERR_IMAGEMIN_PLUGIN_OUTPUT",
        `Plugin at index ${pluginIndex} returned a non-Uint8Array value`,
        { plugin: plugin.name || undefined },
      );
    }

    return new Uint8Array(output);
  } catch (error) {
    throw toImageminError(error, "ERR_IMAGEMIN_PLUGIN", {
      plugin: plugin.name || undefined,
    });
  }
}

function normalizePlugins(plugins: OptimizeOptions["plugins"]): ImageminPlugin[] {
  if (plugins === undefined) return [];
  if (!Array.isArray(plugins)) {
    throw new ImageminError("ERR_IMAGEMIN_INVALID_OPTIONS", "`plugins` must be an array");
  }
  for (const [index, plugin] of plugins.entries()) {
    if (typeof plugin !== "function") {
      throw new ImageminError(
        "ERR_IMAGEMIN_INVALID_OPTIONS",
        `Plugin at index ${index} must be a function`,
      );
    }
  }

  return [...plugins];
}

function normalizeSignal(signal: AbortSignal | undefined): AbortSignal | undefined {
  if (signal === undefined) return undefined;
  if (
    typeof signal !== "object" ||
    signal === null ||
    typeof signal.aborted !== "boolean" ||
    typeof signal.addEventListener !== "function" ||
    typeof signal.removeEventListener !== "function"
  ) {
    throw new ImageminError("ERR_IMAGEMIN_INVALID_OPTIONS", "`signal` must be an AbortSignal");
  }

  return signal;
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  return left.every((byte, index) => byte === right[index]);
}

function detectImageFormat(input: Uint8Array): OptimizationResult["format"] {
  if (startsWith(input, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(input, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWithAscii(input, "GIF87a") || startsWithAscii(input, "GIF89a")) return "gif";
  if (startsWithAscii(input, "RIFF") && asciiAt(input, 8, "WEBP")) return "webp";
  if (asciiAt(input, 4, "ftyp") && (asciiAt(input, 8, "avif") || asciiAt(input, 8, "avis"))) {
    return "avif";
  }

  const sample = new TextDecoder().decode(input.subarray(0, 4096)).trimStart();
  if (sample.startsWith("<svg") || (sample.startsWith("<?xml") && sample.includes("<svg"))) {
    return "svg";
  }

  return "unknown";
}

function startsWith(input: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((byte, index) => input[index] === byte);
}

function startsWithAscii(input: Uint8Array, signature: string): boolean {
  return asciiAt(input, 0, signature);
}

function asciiAt(input: Uint8Array, offset: number, signature: string): boolean {
  if (input.length < offset + signature.length) return false;
  return [...signature].every(
    (character, index) => input[offset + index] === character.charCodeAt(0),
  );
}
