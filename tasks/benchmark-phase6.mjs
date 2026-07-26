import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

import { avif } from "../packages/imagemin/dist/index.mjs";

const ITERATIONS = Number.parseInt(process.env.BENCH_ITERATIONS ?? "20", 10);
const WARMUP_ITERATIONS = 2;

if (!Number.isSafeInteger(ITERATIONS) || ITERATIONS < 1) {
  throw new TypeError("BENCH_ITERATIONS must be a positive safe integer");
}

const [png, jpeg, tiff] = await Promise.all([
  readHex(new URL("../fixtures/png/pngquant-rgba.hex", import.meta.url)),
  readHex(new URL("../fixtures/jpeg/color-metadata.hex", import.meta.url)),
  readHex(new URL("../fixtures/webp/rgb-tiff.hex", import.meta.url)),
]);
const cases = [
  { engine: "avif-png-default", input: png, plugin: avif() },
  {
    engine: "avif-png-lossless-444",
    input: png,
    plugin: avif({ chromaSubsampling: "4:4:4", lossless: true }),
  },
  { engine: "avif-jpeg-quality80", input: jpeg, plugin: avif({ quality: 80 }) },
  { engine: "avif-tiff-fast", input: tiff, plugin: avif({ speed: 8 }) },
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

const concurrency = await benchmarkConcurrency(png, 4);

console.log(
  JSON.stringify(
    {
      concurrency,
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

async function benchmarkConcurrency(input, jobs) {
  const plugin = avif({ effort: 4, quality: 80 });
  await plugin(input);

  const intervalMilliseconds = 5;
  let maximumTimerDelayMilliseconds = 0;
  let nextTick = performance.now() + intervalMilliseconds;
  const timer = setInterval(() => {
    const now = performance.now();
    maximumTimerDelayMilliseconds = Math.max(maximumTimerDelayMilliseconds, now - nextTick);
    nextTick = now + intervalMilliseconds;
  }, intervalMilliseconds);
  const start = performance.now();
  const outputs = await Promise.all(Array.from({ length: jobs }, () => plugin(input)));
  const wallMilliseconds = performance.now() - start;
  clearInterval(timer);

  return {
    jobs,
    maximumTimerDelayMilliseconds: Number(maximumTimerDelayMilliseconds.toFixed(4)),
    outputBytes: outputs.map((output) => output.byteLength),
    wallMilliseconds: Number(wallMilliseconds.toFixed(4)),
  };
}

async function readHex(url) {
  return Buffer.from((await readFile(url, "utf8")).replaceAll(/\s/g, ""), "hex");
}

function percentile(samples, ratio) {
  const index = Math.min(samples.length - 1, Math.floor(samples.length * ratio));
  return Number(samples[index].toFixed(4));
}
