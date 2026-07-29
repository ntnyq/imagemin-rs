import "./style.css";

import type { ImageKind, OptimizeRequest, OptimizeResponse } from "./messages";

const form = requiredElement<HTMLFormElement>("optimizer");
const input = requiredElement<HTMLInputElement>("image");
const optimizeButton = requiredElement<HTMLButtonElement>("optimize");
const cancelButton = requiredElement<HTMLButtonElement>("cancel");
const status = requiredElement<HTMLElement>("status");
const metrics = requiredElement<HTMLElement>("metrics");
const inputBytes = requiredElement<HTMLElement>("input-bytes");
const outputBytes = requiredElement<HTMLElement>("output-bytes");
const codec = requiredElement<HTMLElement>("codec");
const download = requiredElement<HTMLAnchorElement>("download");

let activeRequestId: number | undefined;
let downloadUrl: string | undefined;
let nextRequestId = 0;
let selectedFile: File | undefined;
let worker: Worker | undefined;

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const file = input.files?.[0];
  if (file === undefined) {
    setStatus("Choose a PNG, GIF, or SVG first.", true);
    return;
  }

  const kind = imageKind(file);
  if (kind === undefined) {
    setStatus("This example accepts PNG, GIF, and SVG files.", true);
    return;
  }

  setBusy(true);
  clearDownload();
  selectedFile = file;
  const id = ++nextRequestId;
  activeRequestId = id;

  try {
    const bytes = await file.arrayBuffer();
    if (activeRequestId !== id) return;

    const request: OptimizeRequest = { bytes, id, kind };
    getWorker().postMessage(request, [bytes]);
    setStatus(`Optimizing ${file.name}…`);
  } catch (error) {
    finishWithError(error);
  }
});

cancelButton.addEventListener("click", () => {
  if (activeRequestId === undefined) return;
  resetWorker();
  activeRequestId = undefined;
  setBusy(false);
  setStatus("Optimization canceled. The Worker was terminated.");
});

window.addEventListener("pagehide", () => {
  resetWorker();
  clearDownload();
});

function getWorker(): Worker {
  if (worker !== undefined) return worker;

  worker = new Worker(new URL("./image-worker.ts", import.meta.url), {
    name: "imagemin-rs-example",
    type: "module",
  });
  worker.addEventListener("message", onWorkerMessage);
  worker.addEventListener("error", (event) => {
    finishWithError(event.error instanceof Error ? event.error : new Error(event.message));
    resetWorker();
  });
  return worker;
}

function onWorkerMessage(event: MessageEvent<OptimizeResponse>): void {
  const response = event.data;
  if (response.id !== activeRequestId) return;

  activeRequestId = undefined;
  setBusy(false);

  if (!response.ok) {
    const prefix = [response.code, response.plugin].filter(Boolean).join(" / ");
    setStatus(`${prefix ? `${prefix}: ` : ""}${response.message}`, true);
    return;
  }

  const file = selectedFile;
  if (file === undefined) return;

  const blob = new Blob([response.bytes], { type: outputMimeType(file) });
  downloadUrl = URL.createObjectURL(blob);
  download.href = downloadUrl;
  download.download = outputName(file.name);
  download.hidden = false;

  inputBytes.textContent = formatBytes(response.inputBytes);
  outputBytes.textContent = formatBytes(response.outputBytes);
  codec.textContent = response.codec;
  metrics.hidden = false;
  setStatus(`Finished ${file.name}.`);
}

function finishWithError(error: unknown): void {
  activeRequestId = undefined;
  setBusy(false);
  setStatus(error instanceof Error ? error.message : String(error), true);
}

function resetWorker(): void {
  worker?.terminate();
  worker = undefined;
}

function clearDownload(): void {
  if (downloadUrl !== undefined) URL.revokeObjectURL(downloadUrl);
  downloadUrl = undefined;
  download.hidden = true;
  download.removeAttribute("href");
  metrics.hidden = true;
}

function setBusy(value: boolean): void {
  input.disabled = value;
  optimizeButton.disabled = value;
  cancelButton.disabled = !value;
}

function setStatus(message: string, isError = false): void {
  status.textContent = message;
  status.dataset["error"] = String(isError);
}

function imageKind(file: File): ImageKind | undefined {
  if (file.type === "image/png" || /\.png$/iu.test(file.name)) return "png";
  if (file.type === "image/gif" || /\.gif$/iu.test(file.name)) return "gif";
  if (file.type === "image/svg+xml" || /\.svg$/iu.test(file.name)) return "svg";
  return undefined;
}

function outputMimeType(file: File): string {
  const kind = imageKind(file);
  if (kind === "gif") return "image/gif";
  if (kind === "png") return "image/png";
  if (kind === "svg") return "image/svg+xml";
  return "application/octet-stream";
}

function outputName(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? `${name.slice(0, dot)}.optimized${name.slice(dot)}` : `${name}.optimized`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(2)} KB`;
}

function requiredElement<ElementType extends HTMLElement>(id: string): ElementType {
  const element = document.querySelector(`#${id}`);
  if (!(element instanceof HTMLElement)) throw new Error(`Missing #${id}`);
  return element as ElementType;
}
