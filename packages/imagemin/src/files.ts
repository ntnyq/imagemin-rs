import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { availableParallelism } from "node:os";
import { basename, extname, join } from "node:path";

import { isNotJunk } from "junk";
import { imageDimensionsFromData } from "image-dimensions";
import { globby } from "globby";

import { ImageminError, throwIfAborted, toImageminError } from "./errors";
import { detectImageFormat } from "./format";
import { optimize } from "./optimize";
import { MAX_IMAGE_INPUT_BYTES } from "./limits";
import type { ImageFormat, ImageminOptions, ImageminResult } from "./types";

const FORMAT_EXTENSIONS: Partial<Record<ImageFormat, string>> = {
  avif: ".avif",
  gif: ".gif",
  jpeg: ".jpg",
  png: ".png",
  svg: ".svg",
  webp: ".webp",
};
const DEFAULT_CONCURRENCY = Math.min(4, availableParallelism());
const MAX_CONCURRENCY = 32;

export async function optimizeFiles(
  inputs: readonly string[],
  options: ImageminOptions = {},
): Promise<ImageminResult[]> {
  validateFileOptions(inputs, options);
  const signal = options.signal;
  throwIfAborted(signal);
  // Upstream converts patterns to forward slashes before globbing (via
  // `slash`), which is what makes Windows paths like `C:\images\*` work —
  // globby would otherwise read the backslashes as escapes. globby's async
  // traversal order is then nondeterministic across directories (upstream
  // inherits that); sorting keeps result and destination ordering
  // reproducible while staying set-equivalent with upstream.
  const matchedPaths =
    options.glob === false
      ? [...inputs]
      : (await globby(inputs.map(toGlobPattern), { onlyFiles: true })).sort((left, right) =>
          left < right ? -1 : left > right ? 1 : 0,
        );
  throwIfAborted(signal);
  const sourcePaths = matchedPaths.filter((sourcePath) => isNotJunk(basename(sourcePath)));
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;

  if (options.destination !== undefined) {
    await mkdir(options.destination, { recursive: true });
  }

  return mapConcurrent(sourcePaths, concurrency, (sourcePath) => optimizeFile(sourcePath, options));
}

async function optimizeFile(sourcePath: string, options: ImageminOptions): Promise<ImageminResult> {
  try {
    throwIfAborted(options.signal, { sourcePath });
    const metadata = await stat(sourcePath);
    if (metadata.size > MAX_IMAGE_INPUT_BYTES) {
      throw new ImageminError(
        "ERR_IMAGEMIN_INVALID_INPUT",
        `Image input exceeds the ${MAX_IMAGE_INPUT_BYTES} byte limit`,
        { sourcePath },
      );
    }
    const input = await readFile(sourcePath);
    const inputFormat = detectImageFormat(input);
    const dimensions = imageDimensionsFromData(input);
    const shouldOptimize =
      dimensions === undefined || (dimensions.width !== 0 && dimensions.height !== 0);
    const result = await optimize(input, shouldOptimize ? options : { ...options, plugins: [] });
    const destination = options.destination;
    let destinationPath: string | undefined;

    if (destination !== undefined) {
      destinationPath = join(destination, outputBasename(sourcePath, inputFormat, result.format));
      throwIfAborted(options.signal, { sourcePath });
      await writeFile(destinationPath, result.data);
    }

    return {
      ...result,
      sourcePath,
      ...(destinationPath === undefined ? {} : { destinationPath }),
    };
  } catch (error) {
    throw toImageminError(error, "ERR_IMAGEMIN_IO", { sourcePath });
  }
}

function validateFileOptions(inputs: readonly string[], options: ImageminOptions): void {
  if (!Array.isArray(inputs) || inputs.some((input) => typeof input !== "string")) {
    throw new ImageminError("ERR_IMAGEMIN_INVALID_INPUT", "Expected input paths to be an array");
  }
  if (options === null || typeof options !== "object") {
    throw new ImageminError("ERR_IMAGEMIN_INVALID_OPTIONS", "Expected options to be an object");
  }
  if (options.glob !== undefined && typeof options.glob !== "boolean") {
    throw new ImageminError("ERR_IMAGEMIN_INVALID_OPTIONS", "`glob` must be a boolean");
  }
  if (options.destination !== undefined && typeof options.destination !== "string") {
    throw new ImageminError("ERR_IMAGEMIN_INVALID_OPTIONS", "`destination` must be a string");
  }
  if (options.plugins !== undefined && !Array.isArray(options.plugins)) {
    throw new ImageminError("ERR_IMAGEMIN_INVALID_OPTIONS", "`plugins` must be an array");
  }
  if (options.plugins?.some((plugin) => typeof plugin !== "function")) {
    throw new ImageminError(
      "ERR_IMAGEMIN_INVALID_OPTIONS",
      "Every item in `plugins` must be a function",
    );
  }
  if (
    options.signal !== undefined &&
    (typeof options.signal !== "object" ||
      options.signal === null ||
      typeof options.signal.aborted !== "boolean" ||
      typeof options.signal.addEventListener !== "function" ||
      typeof options.signal.removeEventListener !== "function")
  ) {
    throw new ImageminError("ERR_IMAGEMIN_INVALID_OPTIONS", "`signal` must be an AbortSignal");
  }
  if (
    options.concurrency !== undefined &&
    (!Number.isInteger(options.concurrency) ||
      options.concurrency < 1 ||
      options.concurrency > MAX_CONCURRENCY)
  ) {
    throw new ImageminError(
      "ERR_IMAGEMIN_INVALID_OPTIONS",
      `\`concurrency\` must be an integer between 1 and ${MAX_CONCURRENCY}`,
    );
  }
}

async function mapConcurrent<Input, Output>(
  inputs: readonly Input[],
  concurrency: number,
  operation: (input: Input) => Promise<Output>,
): Promise<Output[]> {
  const outputs = Array.from({ length: inputs.length }) as Output[];
  const failures: { error: unknown; index: number }[] = [];
  let nextIndex = 0;
  let stopping = false;

  const worker = async () => {
    while (!stopping) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= inputs.length) return;

      try {
        outputs[index] = await operation(inputs[index] as Input);
      } catch (error) {
        failures.push({ error, index });
        stopping = true;
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, inputs.length) }, async () => worker()),
  );

  if (failures.length > 0) {
    failures.sort((left, right) => left.index - right.index);
    throw failures[0]?.error;
  }
  return outputs;
}

function toGlobPattern(input: string): string {
  // Same rules as the `slash` package used by upstream: extended-length
  // Windows paths (`\\?\…`) cannot use forward slashes and pass through.
  if (input.startsWith("\\\\?\\")) return input;
  return input.replaceAll("\\", "/");
}

function outputBasename(
  sourcePath: string,
  inputFormat: ImageFormat,
  outputFormat: ImageFormat,
): string {
  const sourceBasename = basename(sourcePath);
  if (inputFormat === outputFormat) return sourceBasename;
  const outputExtension = FORMAT_EXTENSIONS[outputFormat];
  if (outputExtension === undefined) return sourceBasename;
  const sourceExtension = extname(sourceBasename);
  return `${basename(sourceBasename, sourceExtension)}${outputExtension}`;
}
