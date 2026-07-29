import { zipSync } from "fflate";

import type { PlaygroundItem } from "./types";

export async function createArchive(items: PlaygroundItem[]) {
  const files: Record<string, Uint8Array> = {};
  const names = new Set<string>();

  for (const item of items) {
    if (!item.output) continue;

    const name = createUniqueName(item.output.name, names);
    names.add(name);
    files[name] = new Uint8Array(await item.output.blob.arrayBuffer());
  }

  return zipSync(files, { level: 6 });
}

export function createUniqueName(name: string, usedNames: Set<string>) {
  if (!usedNames.has(name)) return name;

  const dot = name.lastIndexOf(".");
  const basename = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : "";
  let suffix = 2;

  while (usedNames.has(`${basename}-${suffix}${extension}`)) suffix += 1;
  return `${basename}-${suffix}${extension}`;
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.download = name;
  anchor.href = url;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
