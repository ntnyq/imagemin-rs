export type ImageminErrorCode =
  | "ERR_IMAGEMIN_INVALID_INPUT"
  | "ERR_IMAGEMIN_INVALID_OPTIONS"
  | "ERR_IMAGEMIN_UNSUPPORTED_PLUGIN"
  | "ERR_IMAGEMIN_PLUGIN_OUTPUT"
  | "ERR_IMAGEMIN_PLUGIN"
  | "ERR_IMAGEMIN_CODEC"
  | "ERR_IMAGEMIN_IO"
  | "ERR_IMAGEMIN_NATIVE_LOAD"
  | "ERR_IMAGEMIN_ABORTED";

interface ImageminErrorOptions {
  cause?: unknown;
  plugin?: string | undefined;
  sourcePath?: string | undefined;
}

export class ImageminError extends Error {
  readonly code: ImageminErrorCode;
  readonly plugin: string | undefined;
  readonly sourcePath: string | undefined;

  constructor(code: ImageminErrorCode, message: string, options: ImageminErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = "ImageminError";
    this.code = code;
    this.plugin = options.plugin;
    this.sourcePath = options.sourcePath;
  }
}

export function toImageminError(
  error: unknown,
  fallbackCode: ImageminErrorCode,
  context: ImageminErrorOptions = {},
): ImageminError {
  if (error instanceof ImageminError) {
    const plugin = error.plugin ?? context.plugin;
    const sourcePath = error.sourcePath ?? context.sourcePath;
    if (plugin === error.plugin && sourcePath === error.sourcePath) return error;
    return new ImageminError(error.code, error.message, {
      cause: error,
      plugin,
      sourcePath,
    });
  }

  if (isAbortError(error)) {
    return new ImageminError("ERR_IMAGEMIN_ABORTED", "Image optimization was aborted", {
      ...context,
      cause: error,
    });
  }

  const message = error instanceof Error ? error.message : String(error);
  const nativeError = message.match(/(ERR_IMAGEMIN_[A-Z_]+):\s*([\s\S]*)/);
  const code = isImageminErrorCode(nativeError?.[1]) ? nativeError[1] : fallbackCode;

  return new ImageminError(code, nativeError?.[2] ?? message, {
    ...context,
    cause: error,
  });
}

export function throwIfAborted(
  signal: AbortSignal | undefined,
  context: ImageminErrorOptions = {},
): void {
  if (!signal?.aborted) return;
  throw new ImageminError("ERR_IMAGEMIN_ABORTED", "Image optimization was aborted", {
    ...context,
    cause: signal.reason,
  });
}

export function rethrowIfAborted(error: unknown): void {
  if (
    (error instanceof ImageminError && error.code === "ERR_IMAGEMIN_ABORTED") ||
    isAbortError(error)
  ) {
    throw error;
  }
}

export function withAbortSignal<Value>(
  operation: PromiseLike<Value>,
  signal: AbortSignal | undefined,
  context: ImageminErrorOptions = {},
): Promise<Value> {
  if (signal === undefined) return Promise.resolve(operation);
  throwIfAborted(signal, context);

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      callback();
    };
    const onAbort = () => {
      finish(() => {
        try {
          throwIfAborted(signal, context);
        } catch (error) {
          reject(error);
        }
      });
    };

    signal.addEventListener("abort", onAbort, { once: true });
    Promise.resolve(operation).then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(error)),
    );
  });
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function isImageminErrorCode(value: string | undefined): value is ImageminErrorCode {
  return value !== undefined && value.startsWith("ERR_IMAGEMIN_");
}
