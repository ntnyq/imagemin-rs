import { ImageminError, toImageminError } from "./errors";
import type { WasmInitInput } from "./types";

type WasmModule = typeof import("./generated/imagemin_wasm_core");

let initialization: Promise<WasmModule> | undefined;
let initialized = false;

export function isWasmInitialized(): boolean {
  return initialized;
}

export async function getWasmModule(): Promise<WasmModule> {
  if (!initialized || initialization === undefined) {
    throw new ImageminError(
      "ERR_IMAGEMIN_WASM_LOAD",
      "imagemin-rs WASM runtime is not initialized; call initWasm() first",
    );
  }

  return initialization;
}

export async function initWasm(input?: WasmInitInput): Promise<void> {
  const attempt = (initialization ??= initializeWasm(input));

  try {
    await attempt;
  } catch (error) {
    if (initialization === attempt) initialization = undefined;
    throw error;
  }
}

async function initializeWasm(input?: WasmInitInput): Promise<WasmModule> {
  try {
    const module = await import("./generated/imagemin_wasm_core");
    await module.default(input === undefined ? undefined : { module_or_path: input });

    if (module.runtime_name() !== "imagemin-rs") {
      throw new Error("imagemin-rs WASM runtime did not initialize correctly");
    }

    initialized = true;
    return module;
  } catch (error) {
    throw toImageminError(error, "ERR_IMAGEMIN_WASM_LOAD");
  }
}
