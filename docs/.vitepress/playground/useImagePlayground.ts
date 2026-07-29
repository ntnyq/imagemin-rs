import { computed, reactive, ref, watch } from "vue";

import { createArchive, downloadBlob } from "./archive";
import { inferMimeType, optimizeImage } from "./image";
import type { PlaygroundItem, PlaygroundOptions } from "./types";

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_FILES = 30;

let fallbackId = 0;

export function useImagePlayground(locale: "en" | "zh") {
  const items = ref<PlaygroundItem[]>([]);
  const isProcessing = ref(false);
  const notice = ref("");
  const options = reactive<PlaygroundOptions>({
    format: "auto",
    keepSmaller: true,
    maxHeight: 2560,
    maxWidth: 2560,
    quality: 82,
  });
  let generation = 0;

  const completedItems = computed(() => items.value.filter((item) => item.output));
  const totalInputBytes = computed(() =>
    completedItems.value.reduce((total, item) => total + item.file.size, 0),
  );
  const totalOutputBytes = computed(() =>
    completedItems.value.reduce((total, item) => total + (item.output?.blob.size ?? 0), 0),
  );
  const canOptimize = computed(() => items.value.length > 0 && !isProcessing.value);
  const canDownloadAll = computed(() => completedItems.value.length > 0 && !isProcessing.value);

  watch(
    options,
    () => {
      if (isProcessing.value) return;
      for (const item of items.value) {
        if (item.status === "done" || item.status === "error") {
          item.error = undefined;
          item.output = undefined;
          item.status = "queued";
        }
      }
    },
    { deep: true },
  );

  function addFiles(files: File[] | FileList | null) {
    if (!files) return;

    const currentKeys = new Set(
      items.value.map((item) => `${item.file.name}:${item.file.size}:${item.file.lastModified}`),
    );
    let unsupported = 0;
    let oversized = 0;
    let duplicate = 0;
    let capacity = 0;

    for (const file of Array.from(files)) {
      const key = `${file.name}:${file.size}:${file.lastModified}`;
      if (!inferMimeType(file)) {
        unsupported += 1;
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        oversized += 1;
        continue;
      }
      if (currentKeys.has(key)) {
        duplicate += 1;
        continue;
      }
      if (items.value.length >= MAX_FILES) {
        capacity += 1;
        continue;
      }

      currentKeys.add(key);
      items.value.push({
        file,
        id: createId(),
        status: "queued",
      });
    }

    notice.value = createSelectionNotice(locale, {
      capacity,
      duplicate,
      oversized,
      unsupported,
    });
  }

  function removeItem(id: string) {
    if (isProcessing.value) return;
    items.value = items.value.filter((item) => item.id !== id);
  }

  function clearItems() {
    if (isProcessing.value) return;
    generation += 1;
    items.value = [];
    notice.value = "";
  }

  async function processAll() {
    if (!canOptimize.value) return;

    const activeGeneration = ++generation;
    isProcessing.value = true;
    notice.value = "";

    for (const item of items.value) {
      item.error = undefined;
      item.output = undefined;
      item.status = "queued";
    }

    try {
      for (const item of items.value) {
        if (generation !== activeGeneration) return;

        item.status = "processing";
        try {
          item.output = await optimizeImage(item.file, { ...options });
          item.status = "done";
        } catch (error) {
          item.error = error instanceof Error ? error.message : String(error);
          item.status = "error";
        }

        await yieldToBrowser();
      }
    } finally {
      if (generation === activeGeneration) isProcessing.value = false;
    }
  }

  function downloadItem(item: PlaygroundItem) {
    if (item.output) downloadBlob(item.output.blob, item.output.name);
  }

  async function downloadAll() {
    if (!canDownloadAll.value) return;
    const archive = await createArchive(completedItems.value);
    const bytes = archive.buffer.slice(
      archive.byteOffset,
      archive.byteOffset + archive.byteLength,
    ) as ArrayBuffer;
    downloadBlob(new Blob([bytes], { type: "application/zip" }), "imagemin-rs-images.zip");
  }

  return {
    addFiles,
    canDownloadAll,
    canOptimize,
    clearItems,
    completedItems,
    downloadAll,
    downloadItem,
    isProcessing,
    items,
    notice,
    options,
    processAll,
    removeItem,
    totalInputBytes,
    totalOutputBytes,
  };
}

function createId() {
  if ("randomUUID" in crypto) return crypto.randomUUID();
  fallbackId += 1;
  return `image-${Date.now()}-${fallbackId}`;
}

function createSelectionNotice(
  locale: "en" | "zh",
  counts: {
    capacity: number;
    duplicate: number;
    oversized: number;
    unsupported: number;
  },
) {
  const skipped = Object.values(counts).reduce((total, value) => total + value, 0);
  if (skipped === 0) return "";

  if (locale === "zh") {
    return `已跳过 ${skipped} 个文件：仅支持 PNG/JPEG/WebP、单张不超过 50 MB，最多 30 张，且不会重复添加。`;
  }
  return `Skipped ${skipped} file(s): use PNG/JPEG/WebP under 50 MB, up to 30 unique files.`;
}

function yieldToBrowser() {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0);
  });
}
