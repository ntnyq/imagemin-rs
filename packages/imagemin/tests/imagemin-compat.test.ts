import { basename, join } from "node:path";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, test } from "vitest";
import upstreamImagemin from "imagemin";
import upstreamWebp from "imagemin-webp";

import imagemin, { type ImageminPlugin, webp } from "../src/index";

const RGBA_PNG_URL = new URL("../../../fixtures/png/pngquant-rgba.hex", import.meta.url);
const temporaryDirectories = new Set<string>();

afterEach(async () => {
  await Promise.all(
    [...temporaryDirectories].map((directory) => rm(directory, { force: true, recursive: true })),
  );
  temporaryDirectories.clear();
});

describe("imagemin 9 file API conformance", () => {
  test("matches literal-path results and filesystem junk filtering", async () => {
    const directory = await createTemporaryDirectory();
    const sourcePath = join(directory, "image.bin");
    const junkPath = join(directory, ".DS_Store");
    await Promise.all([
      writeFile(sourcePath, new Uint8Array([1, 2, 3])),
      writeFile(junkPath, new Uint8Array([4, 5, 6])),
    ]);

    const [actual, expected] = await Promise.all([
      imagemin([junkPath, sourcePath], { glob: false }),
      upstreamImagemin([junkPath, sourcePath], { glob: false }),
    ]);

    expect(projectResults(actual)).toEqual(projectResults(expected));
  });

  test("matches glob expansion, ordering, and no-destination behavior", async () => {
    const directory = await createTemporaryDirectory();
    await Promise.all([
      writeFile(join(directory, "a.bin"), new Uint8Array([1])),
      writeFile(join(directory, "b.bin"), new Uint8Array([2])),
      writeFile(join(directory, ".DS_Store"), new Uint8Array([3])),
    ]);
    const pattern = join(directory, "*");

    const [actual, expected] = await Promise.all([
      imagemin([pattern]),
      upstreamImagemin([pattern]),
    ]);

    expect(projectResults(actual)).toEqual(projectResults(expected));
  });

  test("matches destination writes for format-preserving files", async () => {
    const directory = await createTemporaryDirectory();
    const sourcePath = join(directory, "image.png");
    const actualDestination = join(directory, "actual");
    const expectedDestination = join(directory, "expected");
    const input = await readHexFixture(RGBA_PNG_URL);
    await writeFile(sourcePath, input);

    const [actual, expected] = await Promise.all([
      imagemin([sourcePath], { destination: actualDestination, glob: false }),
      upstreamImagemin([sourcePath], { destination: expectedDestination, glob: false }),
    ]);

    expect(actual[0]?.data).toEqual(expected[0]?.data);
    expect(basename(actual[0]?.destinationPath ?? "")).toBe(
      basename(expected[0]?.destinationPath ?? ""),
    );
    await expect(readFile(actual[0]?.destinationPath ?? "")).resolves.toEqual(input);
  });

  test("matches upstream WebP destination extension behavior", async () => {
    const directory = await createTemporaryDirectory();
    const sourcePath = join(directory, "image.png");
    const input = await readHexFixture(RGBA_PNG_URL);
    await writeFile(sourcePath, input);

    const [actual, expected] = await Promise.all([
      imagemin([sourcePath], {
        destination: join(directory, "actual"),
        glob: false,
        plugins: [webp({ method: 0, quality: 80 })],
      }),
      upstreamImagemin([sourcePath], {
        destination: join(directory, "expected"),
        glob: false,
        plugins: [upstreamWebp({ method: 0, quality: 80 })],
      }),
    ]);

    expect(basename(actual[0]?.destinationPath ?? "")).toBe("image.webp");
    expect(basename(actual[0]?.destinationPath ?? "")).toBe(
      basename(expected[0]?.destinationPath ?? ""),
    );
    expect(actual[0]?.data.subarray(0, 4)).toEqual(new Uint8Array([82, 73, 70, 70]));
    expect(expected[0]?.data.subarray(0, 4)).toEqual(new Uint8Array([82, 73, 70, 70]));
  });

  test("skips plugins for zero-dimension file inputs like upstream", async () => {
    const directory = await createTemporaryDirectory();
    const sourcePath = join(directory, "zero.svg");
    const zeroDimensionPng = await readHexFixture(RGBA_PNG_URL);
    zeroDimensionPng.writeUInt32BE(0, 16);
    await writeFile(sourcePath, zeroDimensionPng);
    let actualCalls = 0;
    let expectedCalls = 0;
    const actualPlugin: ImageminPlugin = (input) => {
      actualCalls += 1;
      return input;
    };
    const expectedPlugin: ImageminPlugin = (input) => {
      expectedCalls += 1;
      return input;
    };

    await Promise.all([
      imagemin([sourcePath], { glob: false, plugins: [actualPlugin] }),
      upstreamImagemin([sourcePath], { glob: false, plugins: [expectedPlugin] }),
    ]);

    expect(actualCalls).toBe(expectedCalls);
    expect(actualCalls).toBe(0);
  });
});

function projectResults(
  results: readonly {
    data: Uint8Array;
    destinationPath?: string;
    sourcePath: string;
  }[],
) {
  return results.map(({ data, destinationPath, sourcePath }) => ({
    data: [...data],
    destinationPath,
    sourcePath,
  }));
}

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "imagemin-rs-compat-"));
  temporaryDirectories.add(directory);
  return directory;
}

async function readHexFixture(url: URL): Promise<Buffer> {
  return Buffer.from((await readFile(url, "utf8")).trim(), "hex");
}
