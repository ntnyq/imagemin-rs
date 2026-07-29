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

type OptimizePngResponse = OptimizePngFailure | OptimizePngSuccess;

interface PendingRequest {
  reject: (error: Error) => void;
  resolve: (bytes: Uint8Array) => void;
}

let nextRequestId = 0;
let worker: Worker | undefined;
const pendingRequests = new Map<number, PendingRequest>();

export function optimizePngWithWasm(input: Uint8Array): Promise<Uint8Array> {
  const activeWorker = getWorker();
  const id = ++nextRequestId;
  const bytes = toArrayBuffer(input);

  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { reject, resolve });
    activeWorker.postMessage({ bytes, id }, [bytes]);
  });
}

function getWorker(): Worker {
  if (worker !== undefined) return worker;

  worker = new Worker(new URL("./wasm-worker.ts", import.meta.url), {
    name: "imagemin-rs-playground",
    type: "module",
  });
  worker.addEventListener("message", onWorkerMessage);
  worker.addEventListener("error", onWorkerError);
  return worker;
}

function onWorkerMessage(event: MessageEvent<OptimizePngResponse>): void {
  const response = event.data;
  const pending = pendingRequests.get(response.id);
  if (pending === undefined) return;
  pendingRequests.delete(response.id);

  if (response.ok) {
    pending.resolve(new Uint8Array(response.bytes));
    return;
  }

  const error = new Error(response.message);
  error.name = response.code ?? "ImageminWasmError";
  pending.reject(error);
}

function onWorkerError(event: ErrorEvent): void {
  const error = event.error instanceof Error ? event.error : new Error(event.message);
  for (const pending of pendingRequests.values()) pending.reject(error);
  pendingRequests.clear();
  worker?.terminate();
  worker = undefined;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
