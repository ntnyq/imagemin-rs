import { readFile } from "node:fs/promises";
import { beforeEach, expect, test, vi } from "vitest";

const wasm = new URL("../src/generated/imagemin_wasm_core_bg.wasm", import.meta.url);

beforeEach(() => {
  vi.resetModules();
});

async function loadRuntime() {
  const [runtime, errors] = await Promise.all([import("../src/runtime"), import("../src/errors")]);
  return { ...runtime, ImageminError: errors.ImageminError };
}

test("requires explicit initialization", async () => {
  const { getWasmModule, isWasmInitialized } = await loadRuntime();

  expect(isWasmInitialized()).toBe(false);
  await expect(getWasmModule()).rejects.toThrow(
    "imagemin-rs WASM runtime is not initialized; call initWasm() first",
  );
});

test("returns the initialized generated module", async () => {
  const { getWasmModule, initWasm, isWasmInitialized } = await loadRuntime();

  await initWasm(await readFile(wasm));

  expect(isWasmInitialized()).toBe(true);
  expect((await getWasmModule()).runtime_name()).toBe("imagemin-rs");
});

test("allows initialization to retry after invalid bytes", async () => {
  const { ImageminError, initWasm, isWasmInitialized } = await loadRuntime();

  const operation = initWasm(new Uint8Array([0]));
  await expect(operation).rejects.toBeInstanceOf(ImageminError);
  await expect(operation).rejects.toMatchObject({ code: "ERR_IMAGEMIN_WASM_LOAD" });
  await expect(operation).rejects.toThrow(/expected 4 bytes/u);
  expect(isWasmInitialized()).toBe(false);

  await initWasm(await readFile(wasm));
  expect(isWasmInitialized()).toBe(true);
});
