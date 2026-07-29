import { giflossless, initWasm, optimize, oxipng, svgm } from "@imagemin-rs/wasm";

import type { ImageKind } from "./messages";

const initialized = initWasm();

export async function optimizeOnMainThread(
  bytes: Uint8Array,
  kind: ImageKind,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  await initialized;

  const plugin =
    kind === "gif"
      ? giflossless({ strip: true })
      : kind === "svg"
        ? svgm({ preset: "safe" })
        : oxipng({ optimizationLevel: 3, strip: "safe" });
  const result = await optimize(bytes, {
    plugins: [plugin],
    ...(signal === undefined ? {} : { signal }),
  });
  return result.data;
}
