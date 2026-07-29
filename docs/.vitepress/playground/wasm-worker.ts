import { initWasm, optimize, oxipng } from "@imagemin-rs/wasm";

interface OptimizePngRequest {
  bytes: ArrayBuffer;
  id: number;
}

interface OptimizePngSuccess {
  bytes: ArrayBuffer;
  id: number;
  ok: true;
}

interface OptimizePngFailure {
  code?: string;
  id: number;
  message: string;
  ok: false;
  plugin?: string;
}

const workerScope = self as DedicatedWorkerGlobalScope;

workerScope.onmessage = async (event: MessageEvent<OptimizePngRequest>) => {
  const { bytes, id } = event.data;

  try {
    await initWasm();
    const result = await optimize(new Uint8Array(bytes), {
      plugins: [oxipng({ optimizationLevel: 3 })],
    });
    const output = toArrayBuffer(result.data);
    const response: OptimizePngSuccess = { bytes: output, id, ok: true };
    workerScope.postMessage(response, [output]);
  } catch (error) {
    const response: OptimizePngFailure = {
      id,
      message: error instanceof Error ? error.message : String(error),
      ok: false,
      ...readErrorContext(error),
    };
    workerScope.postMessage(response);
  }
};

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
