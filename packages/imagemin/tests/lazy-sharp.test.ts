import { readFile } from "node:fs/promises";

import { describe, expect, test, vi } from "vitest";

const PNG_URL = new URL("../../../fixtures/png/pngquant-rgba.hex", import.meta.url);
const sharpResolveAttempts = vi.hoisted(() => ({ count: 0 }));

// Simulates an installation where the sharp dependency is absent: every
// createRequire().resolve("sharp") fails while all other resolution keeps
// working.
vi.mock("node:module", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:module")>();
  const createRequire = (specifier: string | URL): NodeJS.Require => {
    const original = actual.createRequire(specifier);
    const wrapped = ((id: string) => original(id)) as NodeJS.Require;
    Object.assign(wrapped, original);
    wrapped.resolve = ((id: string, options?: { paths?: string[] | undefined }) => {
      if (id === "sharp") {
        sharpResolveAttempts.count += 1;
        throw new Error("Cannot find module 'sharp'");
      }
      return original.resolve(id, options);
    }) as NodeJS.RequireResolve;
    return wrapped;
  };
  return { ...actual, createRequire, default: { ...actual, createRequire } };
});

describe("without an installed sharp dependency", () => {
  test("importing the public entry never resolves sharp", async () => {
    await import("../src");

    expect(sharpResolveAttempts.count).toBe(0);
  });

  test("avif() passes non-convertible inputs through without sharp", async () => {
    const { avif } = await import("../src");
    const junk = Buffer.from("plain text");

    await expect(avif()(junk)).resolves.toBe(junk);
    expect(sharpResolveAttempts.count).toBe(0);
  });

  test("avif() reports a structured codec error for convertible inputs", async () => {
    const { avif } = await import("../src");
    const png = await readHexFixture(PNG_URL);

    await expect(avif()(png)).rejects.toMatchObject({
      code: "ERR_IMAGEMIN_CODEC",
      message: expect.stringContaining("sharp") as string,
    });
    expect(sharpResolveAttempts.count).toBeGreaterThan(0);
  });
});

async function readHexFixture(url: URL): Promise<Buffer> {
  const source = await readFile(url, "utf8");
  return Buffer.from(source.replaceAll(/\s/g, ""), "hex");
}
