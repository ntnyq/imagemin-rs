import { toImageminError } from "./errors";
import { getWasmModule } from "./runtime";
import type { ImageFormat, OptimizationResult, OptimizationStep } from "./types";

export interface WasmPluginDescriptor {
  name: string;
  optionsJson: string;
}

interface RawOptimizationResult {
  data: unknown;
  format: unknown;
  inputBytes: unknown;
  outputBytes: unknown;
  steps: unknown;
}

export async function runWasmPlugins(
  input: Uint8Array,
  plugins: WasmPluginDescriptor[],
): Promise<OptimizationResult> {
  try {
    const module = await getWasmModule();
    const raw = module.optimize_native(input, plugins) as RawOptimizationResult;

    return normalizeResult(raw);
  } catch (error) {
    throw toImageminError(error, "ERR_IMAGEMIN_CODEC", {
      plugin: plugins[0]?.name,
    });
  }
}

function normalizeResult(raw: RawOptimizationResult): OptimizationResult {
  if (
    raw === null ||
    typeof raw !== "object" ||
    typeof raw.format !== "string" ||
    typeof raw.inputBytes !== "number" ||
    typeof raw.outputBytes !== "number" ||
    !Array.isArray(raw.steps)
  ) {
    throw new Error("The imagemin-rs WASM runtime returned an invalid result");
  }

  const data = toUint8Array(raw.data);
  const steps = raw.steps.map(normalizeStep);

  return {
    data,
    format: raw.format as ImageFormat,
    inputBytes: raw.inputBytes,
    outputBytes: raw.outputBytes,
    steps,
  };
}

function normalizeStep(value: unknown): OptimizationStep {
  if (
    value === null ||
    typeof value !== "object" ||
    !("plugin" in value) ||
    typeof value.plugin !== "string" ||
    !("inputBytes" in value) ||
    typeof value.inputBytes !== "number" ||
    !("outputBytes" in value) ||
    typeof value.outputBytes !== "number" ||
    !("changed" in value) ||
    typeof value.changed !== "boolean"
  ) {
    throw new Error("The imagemin-rs WASM runtime returned an invalid optimization step");
  }

  return {
    changed: value.changed,
    inputBytes: value.inputBytes,
    outputBytes: value.outputBytes,
    plugin: value.plugin,
  };
}

function toUint8Array(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return new Uint8Array(value);
  if (Array.isArray(value) && value.every((byte) => Number.isInteger(byte))) {
    return new Uint8Array(value);
  }
  throw new Error("The imagemin-rs WASM runtime returned invalid image bytes");
}
