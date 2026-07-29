export type OutputFormat = "auto" | "image/jpeg" | "image/png" | "image/webp";

export type ItemStatus = "queued" | "processing" | "done" | "error";

export type ProcessingEngine = "canvas" | "canvas-wasm" | "original" | "wasm";

export interface PlaygroundOptions {
  format: OutputFormat;
  keepSmaller: boolean;
  maxHeight: number;
  maxWidth: number;
  quality: number;
}

export interface OptimizedImage {
  blob: Blob;
  engine: ProcessingEngine;
  height: number;
  inputHeight: number;
  inputWidth: number;
  mimeType: string;
  name: string;
  width: number;
}

export interface PlaygroundItem {
  error?: string;
  file: File;
  id: string;
  output?: OptimizedImage;
  status: ItemStatus;
}

export interface PlaygroundCopy {
  addMore: string;
  autoFormat: string;
  batchDownload: string;
  clear: string;
  description: string;
  download: string;
  dropActive: string;
  dropHint: string;
  dropLabel: string;
  empty: string;
  engine: string;
  engineCanvas: string;
  engineCanvasWasm: string;
  engineOriginal: string;
  engineWasm: string;
  failed: string;
  format: string;
  input: string;
  jpegFormat: string;
  keepSmaller: string;
  maxHeight: string;
  maxWidth: string;
  noLimit: string;
  optimize: string;
  optimizing: string;
  output: string;
  pngFormat: string;
  privacy: string;
  quality: string;
  queued: string;
  results: string;
  saved: string;
  selected: string;
  summary: string;
  title: string;
  webpFormat: string;
}
