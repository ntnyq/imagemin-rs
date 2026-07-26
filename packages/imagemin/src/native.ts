import { Buffer } from "node:buffer";

import { toImageminError } from "./errors";
import type { ImageFormat, OptimizationStep } from "./types";

export interface NativePluginDescriptor {
  name: string;
  optionsJson: string;
}

interface NativeOptimizationResult {
  data: Uint8Array;
  format: ImageFormat;
  inputBytes: number;
  outputBytes: number;
  steps: OptimizationStep[];
}

type NativeBinding = typeof import("@imagemin-rs/binding");

let bindingPromise: Promise<NativeBinding> | undefined;

export async function runNativePlugins(
  input: Uint8Array,
  plugins: NativePluginDescriptor[],
): Promise<NativeOptimizationResult> {
  try {
    const binding = await loadNativeBinding();
    const nativeResult = await binding.optimizeNative(Buffer.from(input), plugins);

    return {
      data: new Uint8Array(nativeResult.data),
      format: nativeResult.format as ImageFormat,
      inputBytes: nativeResult.inputBytes,
      outputBytes: nativeResult.outputBytes,
      steps: nativeResult.steps.map((step) => ({ ...step })),
    };
  } catch (error) {
    throw toImageminError(error, "ERR_IMAGEMIN_CODEC");
  }
}

function loadNativeBinding(): Promise<NativeBinding> {
  bindingPromise ??= import("@imagemin-rs/binding").catch((error) => {
    bindingPromise = undefined;
    throw toImageminError(error, "ERR_IMAGEMIN_NATIVE_LOAD");
  });

  return bindingPromise;
}
