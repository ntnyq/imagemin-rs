import type { OptimizedImage, OutputFormat, PlaygroundOptions } from "./types";
import { optimizePngWithWasm } from "./wasm";

const supportedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

interface DecodedImage {
  dispose: () => void;
  height: number;
  source: CanvasImageSource;
  width: number;
}

export function calculateTargetSize(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
) {
  const widthRatio = maxWidth > 0 ? maxWidth / width : 1;
  const heightRatio = maxHeight > 0 ? maxHeight / height : 1;
  const ratio = Math.min(1, widthRatio, heightRatio);

  return {
    height: Math.max(1, Math.round(height * ratio)),
    width: Math.max(1, Math.round(width * ratio)),
  };
}

export function createOutputName(name: string, mimeType: string) {
  const extension = extensionForMimeType(mimeType);
  const basename = name.replace(/\.[^.]+$/u, "") || "image";
  return `${basename}.optimized.${extension}`;
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;

  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = units[0];

  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024;
    unit = units[index];
  }

  return `${value.toFixed(value >= 10 ? 1 : 2)} ${unit}`;
}

export function formatSavings(inputBytes: number, outputBytes: number) {
  if (inputBytes === 0) return "0%";
  const value = ((inputBytes - outputBytes) / inputBytes) * 100;
  return `${value.toFixed(1)}%`;
}

export function inferMimeType(file: File) {
  if (supportedMimeTypes.has(file.type)) return file.type;

  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  return undefined;
}

export async function optimizeImage(
  file: File,
  options: PlaygroundOptions,
): Promise<OptimizedImage> {
  const inputMimeType = inferMimeType(file);
  if (!inputMimeType) {
    throw new Error("Unsupported image type.");
  }

  const decoded = await decodeImage(file);
  try {
    const target = calculateTargetSize(
      decoded.width,
      decoded.height,
      options.maxWidth,
      options.maxHeight,
    );
    const mimeType = resolveOutputMimeType(options.format, inputMimeType);
    const wasResized = target.width !== decoded.width || target.height !== decoded.height;

    if (inputMimeType === "image/png" && mimeType === "image/png" && !wasResized) {
      const bytes = await optimizePngWithWasm(new Uint8Array(await file.arrayBuffer()));
      const blob = new Blob([toArrayBuffer(bytes)], { type: mimeType });
      const useOriginal =
        options.format === "auto" && options.keepSmaller && blob.size >= file.size;

      return {
        blob: useOriginal ? file : blob,
        engine: useOriginal ? "original" : "wasm",
        height: decoded.height,
        inputHeight: decoded.height,
        inputWidth: decoded.width,
        mimeType,
        name: createOutputName(file.name, mimeType),
        width: decoded.width,
      };
    }

    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;

    const context = canvas.getContext("2d", {
      alpha: mimeType !== "image/jpeg",
    });
    if (!context) throw new Error("Canvas rendering is unavailable.");

    if (mimeType === "image/jpeg") {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, target.width, target.height);
    }
    context.drawImage(decoded.source, 0, 0, target.width, target.height);

    let blob = await canvasToBlob(canvas, mimeType, options.quality / 100);
    if (blob.type !== mimeType) {
      throw new Error(
        `This browser cannot encode ${mimeType.replace("image/", "").toUpperCase()}.`,
      );
    }

    let engine: OptimizedImage["engine"] = "canvas";
    if (mimeType === "image/png") {
      const bytes = await optimizePngWithWasm(new Uint8Array(await blob.arrayBuffer()));
      blob = new Blob([toArrayBuffer(bytes)], { type: mimeType });
      engine = "canvas-wasm";
    }

    const useOriginal =
      options.format === "auto" && options.keepSmaller && !wasResized && blob.size >= file.size;
    const outputBlob = useOriginal ? file : blob;
    const outputMimeType = useOriginal ? inputMimeType : mimeType;

    return {
      blob: outputBlob,
      engine: useOriginal ? "original" : engine,
      height: useOriginal ? decoded.height : target.height,
      inputHeight: decoded.height,
      inputWidth: decoded.width,
      mimeType: outputMimeType,
      name: createOutputName(file.name, outputMimeType),
      width: useOriginal ? decoded.width : target.width,
    };
  } finally {
    decoded.dispose();
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("The browser could not encode this image."));
      },
      mimeType,
      quality,
    );
  });
}

async function decodeImage(file: File): Promise<DecodedImage> {
  if ("createImageBitmap" in globalThis) {
    try {
      const bitmap = await createImageBitmap(file, {
        imageOrientation: "from-image",
      });
      return {
        dispose: () => bitmap.close(),
        height: bitmap.height,
        source: bitmap,
        width: bitmap.width,
      };
    } catch {
      // Fall back to an HTMLImageElement for browsers with partial bitmap support.
    }
  }

  const url = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = "async";
  image.src = url;

  try {
    await image.decode();
  } catch {
    URL.revokeObjectURL(url);
    throw new Error("The browser could not decode this image.");
  }

  return {
    dispose: () => URL.revokeObjectURL(url),
    height: image.naturalHeight,
    source: image,
    width: image.naturalWidth,
  };
}

function extensionForMimeType(mimeType: string) {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  return "png";
}

function resolveOutputMimeType(format: OutputFormat, inputMimeType: string) {
  return format === "auto" ? inputMimeType : format;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
