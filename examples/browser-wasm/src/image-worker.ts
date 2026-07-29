import {
  giflossless,
  initWasm,
  optimize,
  oxipng,
  svgm,
  type ImageminPlugin,
} from "@imagemin-rs/wasm";

import type { ImageKind, OptimizeFailure, OptimizeRequest, OptimizeSuccess } from "./messages";

const workerScope = globalThis as unknown as DedicatedWorkerGlobalScope;

workerScope.onmessage = async (event: MessageEvent<OptimizeRequest>) => {
  const { bytes, id, kind } = event.data;

  try {
    await initWasm();
    const result = await optimize(new Uint8Array(bytes), {
      plugins: [pluginFor(kind)],
    });
    const output = toArrayBuffer(result.data);
    const response: OptimizeSuccess = {
      bytes: output,
      codec: result.steps[0]?.plugin ?? kind,
      id,
      inputBytes: result.inputBytes,
      ok: true,
      outputBytes: result.outputBytes,
    };
    workerScope.postMessage(response, [output]);
  } catch (error) {
    const response: OptimizeFailure = {
      id,
      message: error instanceof Error ? error.message : String(error),
      ok: false,
      ...readErrorContext(error),
    };
    workerScope.postMessage(response);
  }
};

function pluginFor(kind: ImageKind): ImageminPlugin {
  if (kind === "gif") return giflossless({ strip: true });
  if (kind === "svg") return svgm({ preset: "safe" });
  return oxipng({ optimizationLevel: 3, strip: "safe" });
}

function readErrorContext(error: unknown): { code?: string; plugin?: string } {
  if (error === null || typeof error !== "object") return {};

  const context: { code?: string; plugin?: string } = {};
  if ("code" in error && typeof error.code === "string") context.code = error.code;
  if ("plugin" in error && typeof error.plugin === "string") context.plugin = error.plugin;
  return context;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
