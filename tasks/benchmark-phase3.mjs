import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

import { pngquant } from "../packages/imagemin/dist/index.mjs";

const ITERATIONS = Number.parseInt(process.env.BENCH_ITERATIONS ?? "30", 10);
const WARMUP_ITERATIONS = 3;

if (!Number.isSafeInteger(ITERATIONS) || ITERATIONS < 1) {
  throw new TypeError("BENCH_ITERATIONS must be a positive safe integer");
}

const png = Buffer.from(
  (await readFile(new URL("../fixtures/png/pngquant-rgba.hex", import.meta.url), "utf8")).trim(),
  "hex",
);
const cases = [
  { engine: "pngquant-default", plugin: pngquant() },
  { engine: "pngquant-speed1", plugin: pngquant({ speed: 1 }) },
  { engine: "pngquant-speed11-ordered", plugin: pngquant({ dithering: false, speed: 11 }) },
];
const results = [];

for (const benchmark of cases) {
  for (let index = 0; index < WARMUP_ITERATIONS; index += 1) {
    await benchmark.plugin(png);
  }

  const samples = [];
  let outputBytes = 0;
  for (let index = 0; index < ITERATIONS; index += 1) {
    const start = performance.now();
    const output = await benchmark.plugin(png);
    samples.push(performance.now() - start);
    outputBytes = output.byteLength;
  }
  samples.sort((left, right) => left - right);
  results.push({
    engine: benchmark.engine,
    inputBytes: png.byteLength,
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

function percentile(samples, ratio) {
  const index = Math.min(samples.length - 1, Math.floor(samples.length * ratio));
  return Number(samples[index].toFixed(4));
}
