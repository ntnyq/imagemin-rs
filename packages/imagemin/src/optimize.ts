import { Buffer } from "node:buffer";

import { ImageminError, throwIfAborted, toImageminError, withAbortSignal } from "./errors";
import { detectImageFormat } from "./format";
import { runNativePlugins } from "./native";
import { getNativeDescriptor } from "./native-plugin";
import { MAX_IMAGE_INPUT_BYTES } from "./limits";
import type {
  ImageminPlugin,
  OptimizationResult,
  OptimizationStep,
  OptimizeOptions,
} from "./types";

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
  throwIfAborted(signal);
  const steps: OptimizationStep[] = [];
  let current: Uint8Array = new Uint8Array(input);
  let index = 0;

  while (index < plugins.length) {
    throwIfAborted(signal);
    const plugin = plugins[index];
    if (plugin === undefined) break;

    const descriptor = getNativeDescriptor(plugin);
    if (descriptor !== undefined) {
      const descriptors = [descriptor];
      index += 1;

      while (index < plugins.length) {
        const nextPlugin = plugins[index];
        if (nextPlugin === undefined) break;

        const nextDescriptor = getNativeDescriptor(nextPlugin);
        if (nextDescriptor === undefined) break;

        descriptors.push(nextDescriptor);
        index += 1;
      }

      const nativeResult = await withAbortSignal(runNativePlugins(current, descriptors), signal, {
        plugin: descriptors[0]?.name,
      });
      current = nativeResult.data;
      steps.push(...nativeResult.steps);
      continue;
    }

    const pluginInput = current;
    current = await runJsPlugin(pluginInput, plugin, index, signal);
    steps.push({
      plugin: plugin.name || `plugin-${index}`,
      inputBytes: pluginInput.byteLength,
      outputBytes: current.byteLength,
      changed: !bytesEqual(pluginInput, current),
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

async function runJsPlugin(
  input: Uint8Array,
  plugin: ImageminPlugin,
  pluginIndex: number,
  signal: AbortSignal | undefined,
): Promise<Uint8Array> {
  try {
    // Upstream imagemin hands plugins Node Buffers, and several official
    // plugins hard-require that (`Buffer.isBuffer` guards in optipng,
    // mozjpeg, gifsicle, webp and svgo). A zero-copy Buffer view keeps
    // third-party plugins behaving exactly as inside upstream imagemin.
    const pluginInput = Buffer.isBuffer(input)
      ? input
      : Buffer.from(input.buffer, input.byteOffset, input.byteLength);
    const output = await withAbortSignal(
      Promise.resolve().then(() =>
        plugin(pluginInput, signal === undefined ? undefined : { signal }),
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
    throw toImageminError(error, "ERR_IMAGEMIN_PLUGIN", { plugin: plugin.name || undefined });
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
