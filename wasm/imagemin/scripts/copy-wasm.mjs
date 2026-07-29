import { copyFile } from "node:fs/promises";

await copyFile(
  new URL("../src/generated/imagemin_wasm_core_bg.wasm", import.meta.url),
  new URL("../dist/imagemin_wasm_core_bg.wasm", import.meta.url),
);
