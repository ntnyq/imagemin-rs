import { describe, expect, test } from "vitest";

import {
  calculateTargetSize,
  createOutputName,
  formatBytes,
  formatSavings,
  inferMimeType,
} from "./image";

describe("image playground helpers", () => {
  test("resizes proportionally without upscaling", () => {
    expect(calculateTargetSize(4000, 2000, 1000, 1000)).toEqual({
      height: 500,
      width: 1000,
    });
    expect(calculateTargetSize(320, 200, 1000, 1000)).toEqual({
      height: 200,
      width: 320,
    });
    expect(calculateTargetSize(4000, 2000, 0, 500)).toEqual({
      height: 500,
      width: 1000,
    });
  });

  test("creates stable names and human-readable metrics", () => {
    expect(createOutputName("photo.source.png", "image/webp")).toBe("photo.source.optimized.webp");
    expect(formatBytes(1536)).toBe("1.50 KB");
    expect(formatSavings(1000, 750)).toBe("25.0%");
    expect(formatSavings(1000, 1200)).toBe("-20.0%");
  });

  test("infers supported file types from MIME or extension", () => {
    expect(inferMimeType(new File(["x"], "photo.JPG"))).toBe("image/jpeg");
    expect(inferMimeType(new File(["x"], "photo.bin", { type: "image/webp" }))).toBe("image/webp");
    expect(inferMimeType(new File(["x"], "photo.gif", { type: "image/gif" }))).toBe(undefined);
  });
});
