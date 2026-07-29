import { describe, expect, test } from "vitest";

import { createUniqueName } from "./archive";

describe("playground archive", () => {
  test("deduplicates output names without losing extensions", () => {
    const names = new Set(["photo.optimized.webp", "photo.optimized-2.webp"]);
    expect(createUniqueName("photo.optimized.webp", names)).toBe("photo.optimized-3.webp");
    expect(createUniqueName("unique.png", names)).toBe("unique.png");
  });
});
