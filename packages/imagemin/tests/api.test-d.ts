import { expectTypeOf, test } from "vitest";

import imagemin, {
  avif,
  giflossless,
  gifsicle,
  optimize,
  optipng,
  oxipng,
  svgm,
  svgo,
  webp,
  type ImageminPlugin,
  type ImageminPluginContext,
  type OptimizationResult,
} from "../src/index";

test("publishes stable Promise-based interfaces", () => {
  expectTypeOf(imagemin.buffer).returns.toEqualTypeOf<Promise<Uint8Array>>();
  expectTypeOf(avif()).toEqualTypeOf<ImageminPlugin>();
  expectTypeOf(optimize).returns.toEqualTypeOf<Promise<OptimizationResult>>();
  expectTypeOf(giflossless()).toEqualTypeOf<ImageminPlugin>();
  expectTypeOf(gifsicle()).toEqualTypeOf<ImageminPlugin>();
  expectTypeOf(optipng()).toEqualTypeOf<ImageminPlugin>();
  expectTypeOf(oxipng()).toEqualTypeOf<ImageminPlugin>();
  expectTypeOf(svgm()).toEqualTypeOf<ImageminPlugin>();
  expectTypeOf(svgo()).toEqualTypeOf<ImageminPlugin>();
  expectTypeOf(webp()).toEqualTypeOf<ImageminPlugin>();
  expectTypeOf<ImageminPluginContext>().toMatchObjectType<{ signal?: AbortSignal }>();

  const controller = new AbortController();
  imagemin(["images/*.png"], { concurrency: 2, signal: controller.signal });
  imagemin.buffer(new Uint8Array(), { signal: controller.signal });

  // @ts-expect-error optimization levels outside Oxipng's 0..6 presets are rejected
  oxipng({ optimizationLevel: 7 });

  optipng({
    bitDepthReduction: true,
    colorTypeReduction: true,
    errorRecovery: true,
    interlaced: null,
    optimizationLevel: 7,
    paletteReduction: true,
  });

  // @ts-expect-error OptiPNG levels above seven are rejected
  optipng({ optimizationLevel: 8 });

  gifsicle({ colors: 256, interlaced: true, optimizationLevel: 3 });

  // @ts-expect-error Gifsicle only defines optimization levels 1..3
  gifsicle({ optimizationLevel: 4 });

  giflossless({ strip: true });

  // @ts-expect-error native lossless GIF intentionally excludes lossy colors
  giflossless({ colors: 128 });

  svgo({
    plugins: [
      { name: "preset-default", params: { overrides: { removeDesc: false } } },
      {
        name: "custom",
        fn: () => ({
          root: {
            enter: () => undefined,
          },
        }),
      },
    ],
  });

  // @ts-expect-error unknown SVGO builtins require an explicit custom plugin function
  svgo({ plugins: ["customPlugin"] });

  svgm({
    passOverrides: { removeDesc: true },
    precision: 3,
    preset: "safe",
  });

  // @ts-expect-error native SVGM pass names are a closed compatibility surface
  svgm({ passOverrides: { customPass: true } });

  webp({
    crop: { height: 64, width: 64, x: 0, y: 0 },
    lossless: 6,
    metadata: ["icc", "exif"],
    method: 6,
    resize: { height: 32, width: 32 },
  });

  // @ts-expect-error WebP presets are a closed union
  webp({ preset: "portrait" });

  avif({
    bitdepth: 8,
    chromaSubsampling: "4:4:4",
    effort: 9,
    lossless: true,
    quality: 100,
  });
  avif({ speed: 8 });

  // @ts-expect-error the prebuilt AVIF runtime intentionally exposes 8-bit output only
  avif({ bitdepth: 10 });

  // @ts-expect-error AVIF chroma subsampling is a closed union
  avif({ chromaSubsampling: "4:2:2" });
});
