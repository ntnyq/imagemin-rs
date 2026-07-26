import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

import { webp } from "../packages/imagemin/dist/index.mjs";

const ITERATIONS = Number.parseInt(process.env.BENCH_ITERATIONS ?? "30", 10);
const WARMUP_ITERATIONS = 3;

if (!Number.isSafeInteger(ITERATIONS) || ITERATIONS < 1) {
  throw new TypeError("BENCH_ITERATIONS must be a positive safe integer");
}

const [png, jpeg, tiff] = await Promise.all([
  readHex(new URL("../fixtures/png/pngquant-rgba.hex", import.meta.url)),
  readHex(new URL("../fixtures/jpeg/color-metadata.hex", import.meta.url)),
  readHex(new URL("../fixtures/webp/rgb-tiff.hex", import.meta.url)),
]);
const cases = [
  { engine: "webp-png-default", input: png, plugin: webp() },
  { engine: "webp-png-lossless", input: png, plugin: webp({ lossless: true }) },
  {
    engine: "webp-jpeg-metadata",
    input: jpeg,
    plugin: webp({ metadata: ["icc", "exif"], quality: 80 }),
  },
  {
    engine: "webp-tiff-crop-resize",
    input: tiff,
    plugin: webp({
      crop: { height: 30, width: 40, x: 8, y: 6 },
      resize: { height: 15, width: 20 },
    }),
  },
];
const results = [];

for (const benchmark of cases) {
  for (let index = 0; index < WARMUP_ITERATIONS; index += 1) {
    await benchmark.plugin(benchmark.input);
  }

  const samples = [];
  let outputBytes = 0;
  for (let index = 0; index < ITERATIONS; index += 1) {
    const start = performance.now();
    const output = await benchmark.plugin(benchmark.input);
    samples.push(performance.now() - start);
    outputBytes = output.byteLength;
  }
  samples.sort((left, right) => left - right);
  results.push({
    engine: benchmark.engine,
    inputBytes: benchmark.input.byteLength,
    iterations: ITERATIONS,
    medianMilliseconds: percentile(samples, 0.5),
    outputBytes,
    p95Milliseconds: percentile(samples, 0.95),
  });
}

console.log(
  JSON.stringify(
    {
      environment: {
        arch: process.arch,
        node: process.version,
        platform: process.platform,
      },
      results,
    },
    undefined,
    2,
  ),
);

async function readHex(url) {
  return Buffer.from((await readFile(url, "utf8")).replaceAll(/\s/g, ""), "hex");
}

function percentile(samples, ratio) {
  const index = Math.min(samples.length - 1, Math.floor(samples.length * ratio));
  return Number(samples[index].toFixed(4));
}
