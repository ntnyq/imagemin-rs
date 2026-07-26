import { Buffer } from "node:buffer";
import { mkdtemp, readFile, rm, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { afterEach, describe, expect, test } from "vitest";
import imageminJpegtran from "imagemin-jpegtran";
import imageminMozjpeg from "imagemin-mozjpeg";
import imageminPngquant from "imagemin-pngquant";
import { decode as decodeJpeg } from "jpeg-js";
import { optimize as optimizeWithSvgo } from "svgo";

import { decodePng } from "./png";
import { MAX_IMAGE_INPUT_BYTES } from "../src/limits";

import imagemin, {
  giflossless,
  gifsicle,
  jpegtran,
  mozjpeg,
  optimize,
  optipng,
  oxipng,
  pngquant,
  svgm,
  svgo,
  type ImageminPlugin,
  type GifsicleOptions,
  type GiflosslessOptions,
  type OptipngOptions,
  type OxipngOptions,
  type JpegtranOptions,
  type MozjpegOptions,
  type PngquantOptions,
  type SvgmOptions,
} from "../src/index";

const ONE_PIXEL_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010804000000b51c0c020000000b4944415478da6364f80f00010501012718e3660000000049454e44ae426082",
  "hex",
);

const BASIC_SVG_URL = new URL("../../../fixtures/svg/basic-icon.svg", import.meta.url);
const ANIMATED_GIF_URL = new URL("../../../fixtures/gif/animation.hex", import.meta.url);
const ANIMATED_PNG_URL = new URL("../../../fixtures/png/animation.hex", import.meta.url);
const JPEG_URL = new URL("../../../fixtures/jpeg/color-metadata.hex", import.meta.url);
const GRAYSCALE_JPEG_URL = new URL("../../../fixtures/jpeg/grayscale.hex", import.meta.url);
const RGBA_PNG_URL = new URL("../../../fixtures/png/pngquant-rgba.hex", import.meta.url);

const temporaryDirectories = new Set<string>();

afterEach(async () => {
  await Promise.all(
    [...temporaryDirectories].map((directory) => rm(directory, { force: true, recursive: true })),
  );
  temporaryDirectories.clear();
});

describe("buffer interface", () => {
  test("returns a copy when no plugins are configured", async () => {
    const input = new Uint8Array([1, 2, 3]);
    const output = await imagemin.buffer(input);

    expect(output).toEqual(input);
    expect(output).not.toBe(input);
  });

  test("runs JavaScript plugins in declaration order", async () => {
    const calls: number[] = [];
    const append =
      (value: number): ImageminPlugin =>
      (input) => {
        calls.push(value);
        return new Uint8Array([...input, value]);
      };

    const output = await imagemin.buffer(new Uint8Array([0]), {
      plugins: [append(1), append(2)],
    });

    expect(calls).toEqual([1, 2]);
    expect(output).toEqual(new Uint8Array([0, 1, 2]));
  });

  test("reports unchanged JavaScript steps accurately", async () => {
    const result = await optimize(new Uint8Array([1, 2, 3]), {
      plugins: [(input) => new Uint8Array(input)],
    });

    expect(result.steps).toEqual([
      expect.objectContaining({
        changed: false,
        inputBytes: 3,
        outputBytes: 3,
      }),
    ]);
  });

  test("rejects invalid JavaScript plugin output", async () => {
    const invalidPlugin = (() => 42) as unknown as ImageminPlugin;

    await expect(
      imagemin.buffer(new Uint8Array([1]), {
        plugins: [invalidPlugin],
      }),
    ).rejects.toMatchObject({
      code: "ERR_IMAGEMIN_PLUGIN_OUTPUT",
    });
  });

  test("passes cancellation context to plugins and rejects with a stable code", async () => {
    const controller = new AbortController();
    let receivedSignal: AbortSignal | undefined;
    const plugin: ImageminPlugin = async (input, context) => {
      receivedSignal = context?.signal;
      controller.abort(new Error("test cancellation"));
      await new Promise(() => undefined);
      return input;
    };

    await expect(
      imagemin.buffer(new Uint8Array([1]), {
        plugins: [plugin],
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({
      code: "ERR_IMAGEMIN_ABORTED",
      plugin: "plugin",
    });
    expect(receivedSignal).toBe(controller.signal);
  });

  test("rejects pre-aborted native work without starting it", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      imagemin.buffer(ONE_PIXEL_PNG, {
        plugins: [oxipng()],
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: "ERR_IMAGEMIN_ABORTED" });
  });

  test("runs official third-party imagemin plugins without an adapter", async () => {
    const input = await readHexFixture(JPEG_URL);
    const plugin = imageminJpegtran({ progressive: true });
    const [actual, expected] = await Promise.all([
      imagemin.buffer(input, { plugins: [plugin] }),
      plugin(input),
    ]);

    expect(Buffer.from(actual)).toEqual(expected);
  });
});

describe("native prototype", () => {
  test("runs oxipng and returns observable statistics", async () => {
    const result = await optimize(ONE_PIXEL_PNG, {
      plugins: [oxipng({ optimizationLevel: 2 })],
    });

    expect(result.format).toBe("png");
    expect(result.outputBytes).toBeLessThanOrEqual(result.inputBytes);
    expect(result.steps).toEqual([expect.objectContaining({ plugin: "oxipng" })]);
  });

  test("rejects unsupported options without silently ignoring them", () => {
    const invalidOptions = {
      optimizationLevel: 7,
    } as unknown as OxipngOptions;

    expect(() => oxipng(invalidOptions)).toThrow(/optimizationLevel/);
  });

  test("keeps unmatched data unchanged", async () => {
    const input = new Uint8Array([1, 2, 3]);
    const output = await imagemin.buffer(input, {
      plugins: [oxipng()],
    });

    expect(output).toEqual(input);
  });

  test("preserves order across native and JavaScript seams", async () => {
    const append =
      (value: number): ImageminPlugin =>
      (input) =>
        new Uint8Array([...input, value]);
    const result = await optimize(new Uint8Array([0]), {
      plugins: [oxipng(), append(1), oxipng(), append(2)],
    });

    expect(result.data).toEqual(new Uint8Array([0, 1, 2]));
    expect(result.steps.map((step) => step.plugin)).toEqual([
      "oxipng",
      "plugin-1",
      "oxipng",
      "plugin-3",
    ]);
  });

  test("keeps empty unmatched input compatible with imagemin plugins", async () => {
    await expect(imagemin.buffer(new Uint8Array(), { plugins: [oxipng()] })).resolves.toEqual(
      new Uint8Array(),
    );
  });
});

describe("OptiPNG compatibility profile", () => {
  test("runs through the native worker pool with upstream defaults", async () => {
    const result = await optimize(ONE_PIXEL_PNG, {
      plugins: [optipng()],
    });

    expect(result.format).toBe("png");
    // imagemin-optipng always requests metadata/interlace transforms and may
    // therefore grow already tiny PNGs.
    expect(result.outputBytes).toBeGreaterThan(0);
    expect(result.steps).toEqual([expect.objectContaining({ plugin: "optipng" })]);
  });

  test("accepts level seven and nullable interlacing", async () => {
    await expect(
      imagemin.buffer(ONE_PIXEL_PNG, {
        plugins: [optipng({ interlaced: null, optimizationLevel: 7 })],
      }),
    ).resolves.toBeInstanceOf(Uint8Array);
  });

  test("rejects unknown and invalid options synchronously", () => {
    expect(() => optipng({ optimizationLevel: 8 } as unknown as OptipngOptions)).toThrow(
      /optimizationLevel/,
    );
    expect(() => optipng({ unknown: true } as unknown as OptipngOptions)).toThrow(
      /Unknown optipng option/,
    );
  });
});

describe("GIF optimization", () => {
  test("preserves animation timing and loop semantics through the Gifsicle sidecar", async () => {
    const input = withApplicationExtension(await readHexFixture(ANIMATED_GIF_URL));
    const before = inspectGif(input);
    const output = await gifsicle({ optimizationLevel: 3 })(input);
    const after = inspectGif(output);
    const normalize = giflossless({ strip: true });
    const [normalizedInput, normalizedOutput] = await Promise.all([
      normalize(input),
      normalize(output),
    ]);

    expect(output.byteLength).toBeLessThan(input.byteLength);
    expect(normalizedOutput).toEqual(normalizedInput);
    expect(Buffer.from(input).includes("IMAGEMINRS1")).toBe(true);
    expect(Buffer.from(output).includes("IMAGEMINRS1")).toBe(false);
    expect(Buffer.from(output).includes("imagemin-rs GIF fixture")).toBe(true);
    expect(after).toMatchObject({
      delays: before.delays,
      frameCount: before.frameCount,
      height: before.height,
      repeat: before.repeat,
      width: before.width,
    });
  });

  test("maps colors and interlacing to the compatibility engine", async () => {
    const input = await readHexFixture(ANIMATED_GIF_URL);
    const output = await gifsicle({ colors: 2, interlaced: true })(input);
    const metadata = inspectGif(output);

    expect(metadata.frameCount).toBe(8);
    expect(metadata.interlaced).toEqual(Array.from({ length: 8 }, () => true));
  });

  test("preserves non-GIF input identity and rejects malformed GIF data", async () => {
    const input = new Uint8Array([1, 2, 3]);
    await expect(gifsicle()(input)).resolves.toBe(input);
    await expect(gifsicle()(Buffer.from("GIF89a12345678901234567890"))).rejects.toMatchObject({
      code: "ERR_IMAGEMIN_CODEC",
      plugin: "gifsicle",
    });
  });

  test("validates compatibility options synchronously", () => {
    expect(() => gifsicle({ optimizationLevel: 4 } as unknown as GifsicleOptions)).toThrow(
      /optimizationLevel/,
    );
    expect(() => gifsicle({ colors: 1 })).toThrow(/colors/);
    expect(() => gifsicle({ unknown: true } as unknown as GifsicleOptions)).toThrow(
      /Unknown gifsicle option/,
    );
  });

  test("provides a permissive native lossless profile", async () => {
    const input = await readHexFixture(ANIMATED_GIF_URL);
    const output = await imagemin.buffer(input, { plugins: [giflossless()] });

    expect(output.byteLength).toBeLessThan(input.byteLength);
    expect(inspectGif(output)).toMatchObject({
      delays: inspectGif(input).delays,
      frameCount: 8,
      repeat: 3,
    });
  });

  test("keeps the native profile's option surface intentionally closed", () => {
    expect(() => giflossless({ unknown: true } as unknown as GiflosslessOptions)).toThrow(
      /Unknown giflossless option/,
    );
  });
});

describe("pngquant compatibility", () => {
  test("matches imagemin-pngquant 10 across its option surface", async () => {
    const input = await readHexFixture(RGBA_PNG_URL);
    const optionMatrix: PngquantOptions[] = [
      {},
      { speed: 1, strip: true },
      { dithering: false, quality: [0.2, 0.8] },
      { dithering: 0.5, posterize: 2, speed: 11 },
    ];

    for (const options of optionMatrix) {
      const [actual, expected] = await Promise.all([
        pngquant(options)(input),
        imageminPngquant(options)(input),
      ]);

      expect(Buffer.from(actual)).toEqual(expected);
    }
  });

  test("keeps transparency in an indexed PNG", async () => {
    const input = await readHexFixture(RGBA_PNG_URL);
    const output = await pngquant()(input);

    expect(output.subarray(0, 8)).toEqual(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(output.byteLength).toBeLessThan(input.byteLength);
    expect(output[25]).toBe(3);
    expect(containsPngChunk(output, "PLTE")).toBe(true);
    expect(containsPngChunk(output, "tRNS")).toBe(true);

    const before = decodePng(input);
    const after = decodePng(output);
    expect([after.width, after.height]).toEqual([before.width, before.height]);
    expect(meanAlphaError(before.rgba, after.rgba)).toBeLessThan(0.04);
    for (const background of [0, 255, "checker"] as const) {
      expect(meanCompositeError(before.rgba, after.rgba, before.width, background)).toBeLessThan(
        0.08,
      );
    }
  });

  test("returns the original input when the quality floor cannot be met", async () => {
    const input = await readHexFixture(RGBA_PNG_URL);
    const output = await pngquant({ quality: [1, 1] })(input);

    expect(output).toBe(input);
  });

  test("conservatively preserves APNG animation", async () => {
    const input = await readHexFixture(ANIMATED_PNG_URL);
    const output = await pngquant()(input);

    expect(containsPngChunk(input, "acTL")).toBe(true);
    expect(output).toBe(input);
  });

  test("preserves non-PNG identity and reports malformed PNG data", async () => {
    const input = new Uint8Array([1, 2, 3]);
    const malformed = Buffer.from("89504e470d0a1a0a00000000", "hex");

    await expect(pngquant()(input)).resolves.toBe(input);
    await expect(pngquant()(malformed)).rejects.toMatchObject({
      code: "ERR_IMAGEMIN_CODEC",
      plugin: "pngquant",
    });
  });

  test("rejects PNG dimension bombs before starting the sidecar", async () => {
    const bomb = Buffer.from(ONE_PIXEL_PNG);
    bomb.writeUInt32BE(100_000, 16);
    bomb.writeUInt32BE(100_000, 20);

    await expect(pngquant()(bomb)).rejects.toMatchObject({
      code: "ERR_IMAGEMIN_INVALID_INPUT",
      plugin: "pngquant",
    });
  });

  test("validates compatibility options synchronously", () => {
    expect(() => pngquant({ speed: 0 })).toThrow(/speed/);
    expect(() => pngquant({ quality: [0.5] } as unknown as PngquantOptions)).toThrow(/quality/);
    expect(() => pngquant({ dithering: true })).toThrow(/dithering/);
    expect(() => pngquant({ posterize: Number.NaN })).toThrow(/posterize/);
    expect(() => pngquant({ unknown: true } as unknown as PngquantOptions)).toThrow(
      /Unknown pngquant option/,
    );
  });
});

describe("MozJPEG compatibility", () => {
  test("matches imagemin-mozjpeg 10 across supported encoder options", async () => {
    const input = await readHexFixture(JPEG_URL);
    const optionMatrix: MozjpegOptions[] = [
      {},
      { progressive: false, quality: 80 },
      {
        dcScanOpt: 2,
        dct: "fast",
        fastCrush: true,
        maxMemory: 8192,
        overshoot: false,
        quantTable: 3,
        sample: ["2x2", "1x1", "1x1"],
        smooth: 10,
        trellis: false,
        trellisDC: false,
        tune: "ssim",
      },
      { arithmetic: true, revert: true },
    ];

    for (const options of optionMatrix) {
      const [actual, expected] = await Promise.all([
        mozjpeg(options)(input),
        imageminMozjpeg(options)(input),
      ]);

      expect(Buffer.from(actual)).toEqual(expected);
    }
  });

  test("emits progressive JPEG by default and retains input marker metadata", async () => {
    const input = await readHexFixture(JPEG_URL);
    const output = await mozjpeg()(input);

    expect(containsJpegMarker(output, 0xc2)).toBe(true);
    expect(Buffer.from(output).includes("Exif")).toBe(true);
    expect(Buffer.from(output).includes("ICC_PROFILE")).toBe(true);
    expect(Buffer.from(output).includes("imagemin-rs JPEG fixture")).toBe(true);

    const before = decodeJpeg(input, { maxMemoryUsageInMB: 64, maxResolutionInMP: 1 });
    const after = decodeJpeg(output, { maxMemoryUsageInMB: 64, maxResolutionInMP: 1 });
    expect([after.width, after.height]).toEqual([before.width, before.height]);
    expect(meanRgbError(before.data, after.data)).toBeLessThan(0.11);
  });

  test("supports one-component grayscale JPEG", async () => {
    const input = await readHexFixture(GRAYSCALE_JPEG_URL);
    const output = await mozjpeg({ progressive: false, quality: 85 })(input);
    const decoded = decodeJpeg(output, { maxMemoryUsageInMB: 64, maxResolutionInMP: 1 });

    expect([decoded.width, decoded.height]).toEqual([96, 64]);
    expect(containsJpegMarker(output, 0xc0)).toBe(true);
  });

  test("repairs the upstream quantBaseline argument bug", async () => {
    const input = await readHexFixture(JPEG_URL);

    await expect(mozjpeg({ quantBaseline: true })(input)).resolves.toBeInstanceOf(Uint8Array);
    // Upstream passes `-quant-baseline true`, so cjpeg treats `true` as its
    // input file. Depending on pipe timing it either reports the bogus path
    // or exits before stdin is written, surfacing as EPIPE.
    await expect(imageminMozjpeg({ quantBaseline: true })(input)).rejects.toThrow(
      /can't open true|EPIPE/,
    );
  });

  test("preserves non-JPEG identity and reports malformed JPEG data", async () => {
    const input = new Uint8Array([1, 2, 3]);
    const malformed = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

    await expect(mozjpeg()(input)).resolves.toBe(input);
    await expect(mozjpeg()(malformed)).rejects.toMatchObject({
      code: "ERR_IMAGEMIN_CODEC",
      plugin: "mozjpeg",
    });
  });

  test("rejects dimension bombs and invalid options before spawning", async () => {
    const bomb = makeJpegDimensionBomb(await readHexFixture(JPEG_URL));

    await expect(mozjpeg()(bomb)).rejects.toMatchObject({
      code: "ERR_IMAGEMIN_INVALID_INPUT",
      plugin: "mozjpeg",
    });
    expect(() => mozjpeg({ quality: 101 })).toThrow(/quality/);
    expect(() => mozjpeg({ fastcrush: true } as unknown as MozjpegOptions)).toThrow(/fastCrush/);
    expect(() => mozjpeg({ unknown: true } as unknown as MozjpegOptions)).toThrow(
      /Unknown mozjpeg option/,
    );
  });
});

describe("jpegtran compatibility", () => {
  test("matches imagemin-jpegtran 8 for sequential, progressive, and arithmetic output", async () => {
    const input = await readHexFixture(JPEG_URL);
    const optionMatrix: JpegtranOptions[] = [
      {},
      { progressive: true },
      { arithmetic: true },
      { arithmetic: true, progressive: true },
    ];

    for (const options of optionMatrix) {
      const [actual, expected] = await Promise.all([
        jpegtran(options)(input),
        imageminJpegtran(options)(input),
      ]);

      expect(Buffer.from(actual)).toEqual(expected);
    }
  });

  test("strips marker metadata and can convert losslessly to progressive", async () => {
    const input = await readHexFixture(JPEG_URL);
    const output = await jpegtran({ progressive: true })(input);

    expect(containsJpegMarker(input, 0xc0)).toBe(true);
    expect(containsJpegMarker(output, 0xc2)).toBe(true);
    expect(Buffer.from(output).includes("Exif")).toBe(false);
    expect(Buffer.from(output).includes("ICC_PROFILE")).toBe(false);
    expect(Buffer.from(output).includes("imagemin-rs JPEG fixture")).toBe(false);

    const before = decodeJpeg(input, { maxMemoryUsageInMB: 64, maxResolutionInMP: 1 });
    const after = decodeJpeg(output, { maxMemoryUsageInMB: 64, maxResolutionInMP: 1 });
    expect(after.data).toEqual(before.data);
  });

  test("keeps grayscale coefficients lossless", async () => {
    const input = await readHexFixture(GRAYSCALE_JPEG_URL);
    const output = await jpegtran({ progressive: true })(input);
    const before = decodeJpeg(input, { maxMemoryUsageInMB: 64, maxResolutionInMP: 1 });
    const after = decodeJpeg(output, { maxMemoryUsageInMB: 64, maxResolutionInMP: 1 });

    expect(after.data).toEqual(before.data);
  });

  test("preserves non-JPEG identity and reports malformed input", async () => {
    const input = new Uint8Array([1, 2, 3]);
    const malformed = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

    await expect(jpegtran()(input)).resolves.toBe(input);
    await expect(jpegtran()(malformed)).rejects.toMatchObject({
      code: "ERR_IMAGEMIN_CODEC",
      plugin: "jpegtran",
    });
  });

  test("validates resource limits and the closed option surface", async () => {
    const bomb = makeJpegDimensionBomb(await readHexFixture(JPEG_URL));

    await expect(jpegtran()(bomb)).rejects.toMatchObject({
      code: "ERR_IMAGEMIN_INVALID_INPUT",
      plugin: "jpegtran",
    });
    expect(() => jpegtran({ progressive: 1 } as unknown as JpegtranOptions)).toThrow(/progressive/);
    expect(() => jpegtran({ unknown: true } as unknown as JpegtranOptions)).toThrow(
      /Unknown jpegtran option/,
    );
  });
});

describe("SVGO compatibility plugin", () => {
  test("matches the pinned SVGO runtime with imagemin-svgo defaults", async () => {
    const input = await readFile(BASIC_SVG_URL);
    const source = input.toString();
    const output = await svgo()(input);
    const expected = optimizeWithSvgo(source, { multipass: true }).data;

    expect(Buffer.from(output).toString()).toBe(expected);
  });

  test("preserves non-SVG input identity", async () => {
    const input = new Uint8Array([1, 2, 3]);

    await expect(svgo()(input)).resolves.toBe(input);
  });

  test("preserves ordered, repeated, and custom JavaScript plugins", async () => {
    const input = await readFile(BASIC_SVG_URL);
    const calls: string[] = [];
    const marker = {
      name: "marker",
      fn: () => ({
        element: {
          enter: () => {
            calls.push("marker");
          },
        },
      }),
    };
    const options = {
      multipass: false,
      plugins: ["removeComments" as const, marker, marker],
    };
    const output = await svgo(options)(input);
    const callCount = calls.length;
    calls.length = 0;
    const expected = optimizeWithSvgo(input.toString(), options).data;

    expect(Buffer.from(output).toString()).toBe(expected);
    expect(callCount).toBe(calls.length);
    expect(callCount).toBeGreaterThan(0);
  });

  test("passes all top-level SVGO options through unchanged", async () => {
    const input = await readFile(BASIC_SVG_URL);
    const options = {
      datauri: "enc" as const,
      floatPrecision: 2,
      js2svg: { pretty: true },
      multipass: false,
      path: "/fixtures/basic-icon.svg",
      plugins: [],
    };
    const output = await svgo(options)(input);

    expect(Buffer.from(output).toString()).toBe(optimizeWithSvgo(input.toString(), options).data);
  });

  test("uses exact SVGO error behavior at plugin execution time", async () => {
    const input = await readFile(BASIC_SVG_URL);
    const plugin = svgo({ plugins: ["notARealPlugin" as never] });

    await expect(plugin(input)).rejects.toThrow('Unknown builtin plugin "notARealPlugin"');
  });
});

describe("native SVGM optimization", () => {
  test("optimizes SVG through the safe worker-pool preset", async () => {
    const input = await readFile(BASIC_SVG_URL);
    const result = await optimize(input, { plugins: [svgm()] });
    const output = Buffer.from(result.data).toString();

    expect(result.format).toBe("svg");
    expect(result.outputBytes).toBeLessThan(result.inputBytes);
    expect(result.steps).toEqual([expect.objectContaining({ changed: true, plugin: "svgm" })]);
    expect(output).toContain("<title>Accessible status icon</title>");
    expect(output).toContain('viewBox="0 0 64 64"');
  });

  test("applies validated native pass overrides", async () => {
    const input = await readFile(BASIC_SVG_URL);
    const output = await imagemin.buffer(input, {
      plugins: [svgm({ passOverrides: { removeComments: false } })],
    });

    expect(Buffer.from(output).toString()).toContain("Exported by");
  });

  test("rejects invalid native options synchronously", () => {
    expect(() => svgm({ unknown: true } as unknown as SvgmOptions)).toThrow(/Unknown svgm option/);
    expect(() => svgm({ passOverrides: { notARealPass: true } as never })).toThrow(
      /Unknown SVGM pass/,
    );
  });
});

describe("file interface", () => {
  test("reads, optimizes, and writes files without glob expansion", async () => {
    const directory = await mkdtemp(join(tmpdir(), "imagemin-rs-"));
    temporaryDirectories.add(directory);
    const sourcePath = join(directory, "input.bin");
    const destination = join(directory, "output");
    await writeFile(sourcePath, new Uint8Array([1, 2, 3]));

    const results = await imagemin([sourcePath], {
      destination,
      glob: false,
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.sourcePath).toBe(sourcePath);
    expect(await readFile(join(destination, "input.bin"))).toEqual(Buffer.from([1, 2, 3]));
  });

  test("filters filesystem junk for literal input paths", async () => {
    const directory = await mkdtemp(join(tmpdir(), "imagemin-rs-"));
    temporaryDirectories.add(directory);
    const imagePath = join(directory, "image.bin");
    const junkPath = join(directory, ".DS_Store");
    await Promise.all([
      writeFile(imagePath, new Uint8Array([1])),
      writeFile(junkPath, new Uint8Array([2])),
    ]);

    const results = await imagemin([junkPath, imagePath], { glob: false });

    expect(results.map(({ sourcePath }) => sourcePath)).toEqual([imagePath]);
  });

  test("limits file concurrency while preserving input order", async () => {
    const directory = await mkdtemp(join(tmpdir(), "imagemin-rs-"));
    temporaryDirectories.add(directory);
    const sourcePaths = Array.from({ length: 6 }, (_, index) => join(directory, `${index}.bin`));
    await Promise.all(
      sourcePaths.map((sourcePath, index) => writeFile(sourcePath, new Uint8Array([index]))),
    );
    let active = 0;
    let maximumActive = 0;
    const plugin: ImageminPlugin = async (input) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await delay(20);
      active -= 1;
      return input;
    };

    const results = await imagemin(sourcePaths, {
      concurrency: 2,
      glob: false,
      plugins: [plugin],
    });

    expect(maximumActive).toBe(2);
    expect(results.map(({ sourcePath }) => sourcePath)).toEqual(sourcePaths);
  });

  test("attaches the failing source path without scheduling the remaining queue", async () => {
    const directory = await mkdtemp(join(tmpdir(), "imagemin-rs-"));
    temporaryDirectories.add(directory);
    const sourcePaths = Array.from({ length: 3 }, (_, index) => join(directory, `${index}.bin`));
    await Promise.all(
      sourcePaths.map((sourcePath, index) => writeFile(sourcePath, new Uint8Array([index]))),
    );
    const visited: number[] = [];
    const plugin: ImageminPlugin = (input) => {
      const value = input[0] ?? -1;
      visited.push(value);
      if (value === 1) throw new Error("fixture failure");
      return input;
    };

    await expect(
      imagemin(sourcePaths, { concurrency: 1, glob: false, plugins: [plugin] }),
    ).rejects.toMatchObject({
      code: "ERR_IMAGEMIN_PLUGIN",
      sourcePath: sourcePaths[1],
    });
    expect(visited).toEqual([0, 1]);
  });

  test("validates batch controls before touching the filesystem", async () => {
    await expect(imagemin([], { concurrency: 0 })).rejects.toMatchObject({
      code: "ERR_IMAGEMIN_INVALID_OPTIONS",
    });
    await expect(
      imagemin([], { plugins: {} as unknown as ImageminPlugin[] }),
    ).rejects.toMatchObject({
      code: "ERR_IMAGEMIN_INVALID_OPTIONS",
    });
  });

  test("rejects oversized files from metadata before allocating their contents", async () => {
    const directory = await mkdtemp(join(tmpdir(), "imagemin-rs-"));
    temporaryDirectories.add(directory);
    const sourcePath = join(directory, "oversized.bin");
    await writeFile(sourcePath, new Uint8Array());
    await truncate(sourcePath, MAX_IMAGE_INPUT_BYTES + 1);

    await expect(imagemin([sourcePath], { glob: false })).rejects.toMatchObject({
      code: "ERR_IMAGEMIN_INVALID_INPUT",
      sourcePath,
    });
  });
});

async function readHexFixture(url: URL): Promise<Buffer> {
  return Buffer.from((await readFile(url, "utf8")).trim(), "hex");
}

function withApplicationExtension(input: Buffer): Buffer {
  const screenFlags = input[10] ?? 0;
  const paletteBytes = screenFlags & 0x80 ? 3 * 2 ** ((screenFlags & 0x07) + 1) : 0;
  const position = 13 + paletteBytes;
  const extension = Buffer.concat([
    Buffer.from([0x21, 0xff, 0x0b]),
    Buffer.from("IMAGEMINRS1"),
    Buffer.from([0x03, 0x01, 0x02, 0x03, 0x00]),
  ]);

  return Buffer.concat([input.subarray(0, position), extension, input.subarray(position)]);
}

function containsPngChunk(input: Uint8Array, expected: string): boolean {
  const data = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  let position = 8;

  while (position + 12 <= data.length) {
    const length = data.readUInt32BE(position);
    if (data.subarray(position + 4, position + 8).toString() === expected) return true;
    position += length + 12;
  }

  return false;
}

function meanAlphaError(before: Uint8Array, after: Uint8Array): number {
  let difference = 0;
  for (let index = 3; index < before.length; index += 4) {
    difference += Math.abs((before[index] ?? 0) - (after[index] ?? 0));
  }
  return difference / (before.length / 4) / 255;
}

function meanCompositeError(
  before: Uint8Array,
  after: Uint8Array,
  width: number,
  background: 0 | 255 | "checker",
): number {
  let difference = 0;
  for (let index = 0; index < before.length; index += 4) {
    const pixel = index / 4;
    const backgroundValue =
      background === "checker"
        ? (Math.floor(pixel / width / 8) + Math.floor((pixel % width) / 8)) % 2 === 0
          ? 0
          : 255
        : background;
    const beforeAlpha = (before[index + 3] ?? 0) / 255;
    const afterAlpha = (after[index + 3] ?? 0) / 255;
    for (let channel = 0; channel < 3; channel += 1) {
      const beforeValue =
        (before[index + channel] ?? 0) * beforeAlpha + backgroundValue * (1 - beforeAlpha);
      const afterValue =
        (after[index + channel] ?? 0) * afterAlpha + backgroundValue * (1 - afterAlpha);
      difference += Math.abs(beforeValue - afterValue);
    }
  }
  return difference / (before.length / 4) / 3 / 255;
}

function meanRgbError(before: Uint8Array, after: Uint8Array): number {
  let difference = 0;
  for (let index = 0; index < before.length; index += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      difference += Math.abs((before[index + channel] ?? 0) - (after[index + channel] ?? 0));
    }
  }
  return difference / (before.length / 4) / 3 / 255;
}

function containsJpegMarker(input: Uint8Array, expected: number): boolean {
  return findJpegMarker(input, expected) !== undefined;
}

function makeJpegDimensionBomb(input: Buffer): Buffer {
  const output = Buffer.from(input);
  const position = findJpegMarker(output, 0xc0);
  if (position === undefined) throw new Error("Expected a baseline JPEG fixture");
  output.writeUInt16BE(0xffff, position + 5);
  output.writeUInt16BE(0xffff, position + 7);
  return output;
}

function findJpegMarker(input: Uint8Array, expected: number): number | undefined {
  let position = 2;

  while (position + 3 < input.byteLength) {
    while (input[position] === 0xff) position += 1;
    const markerPosition = position - 1;
    const marker = input[position] ?? 0;
    position += 1;
    if (marker === expected) return markerPosition;
    if (marker === 0xda || marker === 0xd9) return undefined;
    if (marker === 0 || marker === 1 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    const length = ((input[position] ?? 0) << 8) | (input[position + 1] ?? 0);
    if (length < 2 || position + length > input.byteLength) return undefined;
    position += length;
  }

  return undefined;
}

function inspectGif(input: Uint8Array): {
  delays: number[];
  frameCount: number;
  height: number;
  interlaced: boolean[];
  repeat: number | "infinite" | undefined;
  width: number;
} {
  const data = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  if (data.subarray(0, 3).toString() !== "GIF") throw new TypeError("Expected GIF data");
  const width = data.readUInt16LE(6);
  const height = data.readUInt16LE(8);
  let position = 13;
  const screenFlags = data[10] ?? 0;
  if (screenFlags & 0x80) position += 3 * 2 ** ((screenFlags & 0x07) + 1);

  const delays: number[] = [];
  const interlaced: boolean[] = [];
  let pendingDelay = 0;
  let repeat: number | "infinite" | undefined;

  while (position < data.length) {
    const introducer = data[position];
    if (introducer === 0x3b) break;
    if (introducer === 0x2c) {
      const flags = data[position + 9] ?? 0;
      delays.push(pendingDelay);
      interlaced.push(Boolean(flags & 0x40));
      pendingDelay = 0;
      position += 10;
      if (flags & 0x80) position += 3 * 2 ** ((flags & 0x07) + 1);
      position += 1;
      position = skipGifSubBlocks(data, position);
      continue;
    }
    if (introducer !== 0x21) throw new Error("Malformed GIF block stream");

    const label = data[position + 1];
    position += 2;
    if (label === 0xf9) {
      const blockLength = data[position] ?? 0;
      if (blockLength !== 4) throw new Error("Malformed GIF control extension");
      pendingDelay = data.readUInt16LE(position + 2);
      position += 6;
      continue;
    }
    if (label === 0xff) {
      const identifierLength = data[position] ?? 0;
      const identifier = data.subarray(position + 1, position + 1 + identifierLength).toString();
      position += 1 + identifierLength;
      if (identifier === "NETSCAPE2.0" || identifier === "ANIMEXTS1.0") {
        const subBlockLength = data[position] ?? 0;
        if (subBlockLength >= 3 && data[position + 1] === 1) {
          const count = data.readUInt16LE(position + 2);
          repeat = count === 0 ? "infinite" : count;
        }
      }
      position = skipGifSubBlocks(data, position);
      continue;
    }
    position = skipGifSubBlocks(data, position);
  }

  return { delays, frameCount: delays.length, height, interlaced, repeat, width };
}

function skipGifSubBlocks(data: Buffer, start: number): number {
  let position = start;
  while (position < data.length) {
    const length = data[position] ?? 0;
    position += 1;
    if (length === 0) return position;
    position += length;
  }
  throw new Error("Truncated GIF sub-block stream");
}
