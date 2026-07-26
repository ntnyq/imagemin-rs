import { Buffer } from "node:buffer";
import { basename, join } from "node:path";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, test } from "vitest";
import upstreamImagemin from "imagemin";
import imageminAvif from "imagemin-avif";
import imageminGifsicle from "imagemin-gifsicle";
import imageminJpegtran from "imagemin-jpegtran";
import imageminMozjpeg from "imagemin-mozjpeg";
import imageminOptipng from "imagemin-optipng";
import imageminPngquant from "imagemin-pngquant";
import imageminSvgo from "imagemin-svgo";
import imageminWebp from "imagemin-webp";

import imagemin, { optimize, oxipng, type ImageminPlugin } from "../src/index";

// Official third-party plugin interop matrix: every official imagemin plugin
// family must run inside this pipeline without an adapter and produce output
// byte-identical to upstream `imagemin@9` running the very same plugin.
// Each plugin was verified deterministic for repeated same-process runs, so
// byte equality between the two pipelines is a sound gate.

const PNG_URL = new URL("../../../fixtures/png/pngquant-rgba.hex", import.meta.url);
const GIF_URL = new URL("../../../fixtures/gif/animation.hex", import.meta.url);
const JPEG_URL = new URL("../../../fixtures/jpeg/color-metadata.hex", import.meta.url);
const SVG_URL = new URL("../../../fixtures/svg/basic-icon.svg", import.meta.url);

const temporaryDirectories = new Set<string>();

afterEach(async () => {
  await Promise.all(
    [...temporaryDirectories].map((directory) => rm(directory, { force: true, recursive: true })),
  );
  temporaryDirectories.clear();
});

type OfficialPlugin = (input: Buffer) => Uint8Array | PromiseLike<Uint8Array>;

// The pipeline hands function plugins a Node Buffer (see optimize.ts), so a
// Buffer-only official plugin satisfies the ImageminPlugin contract at
// runtime even though its declared parameter type is narrower.
function asPlugin(plugin: OfficialPlugin): ImageminPlugin {
  return plugin as unknown as ImageminPlugin;
}

interface MatrixCase {
  fixture: () => Promise<Buffer>;
  makePlugin: () => OfficialPlugin;
  name: string;
}

const MATRIX: MatrixCase[] = [
  {
    fixture: () => readSvgFixture(),
    makePlugin: () => imageminSvgo() as OfficialPlugin,
    name: "imagemin-svgo",
  },
  {
    fixture: () => readHexFixture(GIF_URL),
    makePlugin: () => imageminGifsicle({ optimizationLevel: 2 }) as OfficialPlugin,
    name: "imagemin-gifsicle",
  },
  {
    fixture: () => readHexFixture(PNG_URL),
    makePlugin: () => imageminOptipng() as OfficialPlugin,
    name: "imagemin-optipng",
  },
  {
    fixture: () => readHexFixture(PNG_URL),
    makePlugin: () => imageminPngquant({ speed: 10 }) as OfficialPlugin,
    name: "imagemin-pngquant",
  },
  {
    fixture: () => readHexFixture(JPEG_URL),
    makePlugin: () => imageminMozjpeg({ quality: 80 }) as OfficialPlugin,
    name: "imagemin-mozjpeg",
  },
  {
    fixture: () => readHexFixture(JPEG_URL),
    makePlugin: () => imageminJpegtran({ progressive: true }) as OfficialPlugin,
    name: "imagemin-jpegtran",
  },
  {
    fixture: () => readHexFixture(PNG_URL),
    makePlugin: () => imageminWebp({ method: 0 }) as OfficialPlugin,
    name: "imagemin-webp",
  },
  {
    fixture: () => readHexFixture(PNG_URL),
    makePlugin: () => imageminAvif() as OfficialPlugin,
    name: "imagemin-avif",
  },
];

describe("official plugin interop matrix", () => {
  test("hands function plugins a Node Buffer exactly like upstream", async () => {
    let receivedBuffer = false;
    const probe: ImageminPlugin = (input) => {
      receivedBuffer = Buffer.isBuffer(input);
      return input;
    };

    await imagemin.buffer(new Uint8Array([1, 2, 3]), { plugins: [probe] });

    expect(receivedBuffer).toBe(true);
  });

  test.each(MATRIX)(
    "matches the upstream pipeline byte-for-byte for $name",
    async ({ fixture, makePlugin }) => {
      const input = await fixture();

      const [ours, theirs] = await Promise.all([
        imagemin.buffer(input, { plugins: [asPlugin(makePlugin())] }),
        upstreamImagemin.buffer(input, { plugins: [asPlugin(makePlugin())] }),
      ]);

      expect(ours.length).toBeGreaterThan(0);
      expect(Buffer.from(ours).equals(Buffer.from(theirs))).toBe(true);
    },
    120_000,
  );

  test.each([
    ["imagemin-svgo", () => imageminSvgo() as OfficialPlugin, PNG_URL],
    ["imagemin-optipng", () => imageminOptipng() as OfficialPlugin, JPEG_URL],
    ["imagemin-pngquant", () => imageminPngquant({ speed: 10 }) as OfficialPlugin, JPEG_URL],
    ["imagemin-mozjpeg", () => imageminMozjpeg() as OfficialPlugin, PNG_URL],
    ["imagemin-jpegtran", () => imageminJpegtran() as OfficialPlugin, PNG_URL],
    ["imagemin-gifsicle", () => imageminGifsicle() as OfficialPlugin, PNG_URL],
  ] as const)(
    "passes non-matching input through %s like upstream",
    async (_name, makePlugin, fixtureUrl) => {
      const input = await readHexFixture(fixtureUrl);

      const [ours, theirs] = await Promise.all([
        imagemin.buffer(input, { plugins: [asPlugin(makePlugin())] }),
        upstreamImagemin.buffer(input, { plugins: [asPlugin(makePlugin())] }),
      ]);

      expect(Buffer.from(ours).equals(input)).toBe(true);
      expect(Buffer.from(theirs).equals(input)).toBe(true);
    },
    120_000,
  );

  test("keeps native fusion honest across an official plugin seam", async () => {
    const input = await readHexFixture(PNG_URL);

    const result = await optimize(input, {
      plugins: [oxipng({ optimizationLevel: 2 }), asPlugin(imageminOptipng()), oxipng()],
    });
    // The official JS plugin must break native fusion into two segments.
    expect(result.steps.map((step) => step.plugin)).toEqual(["oxipng", "plugin-1", "oxipng"]);

    const firstNative = await imagemin.buffer(input, {
      plugins: [oxipng({ optimizationLevel: 2 })],
    });
    const official = await (imageminOptipng() as OfficialPlugin)(Buffer.from(firstNative));
    const manual = await imagemin.buffer(official, { plugins: [oxipng()] });
    expect(Buffer.from(result.data).equals(Buffer.from(manual))).toBe(true);
  }, 120_000);

  test("propagates official plugin failures with the stable plugin error code", async () => {
    const truncated = (await readHexFixture(JPEG_URL)).subarray(0, 96);

    await expect(
      imagemin.buffer(truncated, { plugins: [asPlugin(imageminMozjpeg())] }),
    ).rejects.toMatchObject({ code: "ERR_IMAGEMIN_PLUGIN" });
    await expect(
      upstreamImagemin.buffer(truncated, { plugins: [asPlugin(imageminMozjpeg())] }),
    ).rejects.toThrow();
  }, 120_000);

  test("matches upstream file destinations when running the official WebP plugin", async () => {
    const directory = await createTemporaryDirectory();
    const sourcePath = join(directory, "image.png");
    await writeFile(sourcePath, await readHexFixture(PNG_URL));

    const [actual, expected] = await Promise.all([
      imagemin([sourcePath], {
        destination: join(directory, "actual"),
        glob: false,
        plugins: [imageminWebp({ method: 0 })],
      }),
      upstreamImagemin([sourcePath], {
        destination: join(directory, "expected"),
        glob: false,
        plugins: [imageminWebp({ method: 0 })],
      }),
    ]);

    expect(basename(actual[0]?.destinationPath ?? "")).toBe("image.webp");
    expect(basename(actual[0]?.destinationPath ?? "")).toBe(
      basename(expected[0]?.destinationPath ?? ""),
    );
    expect(Buffer.from(actual[0]?.data ?? []).equals(Buffer.from(expected[0]?.data ?? []))).toBe(
      true,
    );
    const [actualFile, expectedFile] = await Promise.all([
      readFile(actual[0]?.destinationPath ?? ""),
      readFile(expected[0]?.destinationPath ?? ""),
    ]);
    expect(actualFile.equals(expectedFile)).toBe(true);
  }, 120_000);
});

async function readHexFixture(url: URL): Promise<Buffer> {
  return Buffer.from((await readFile(url, "utf8")).trim(), "hex");
}

async function readSvgFixture(): Promise<Buffer> {
  return Buffer.from(await readFile(SVG_URL));
}

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "imagemin-rs-matrix-"));
  temporaryDirectories.add(directory);
  return directory;
}
