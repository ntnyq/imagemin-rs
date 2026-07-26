import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

import { giflossless, gifsicle, optipng, oxipng } from "../packages/imagemin/dist/index.mjs";

const ITERATIONS = Number.parseInt(process.env.BENCH_ITERATIONS ?? "30", 10);
const WARMUP_ITERATIONS = 3;

if (!Number.isSafeInteger(ITERATIONS) || ITERATIONS < 1) {
  throw new TypeError("BENCH_ITERATIONS must be a positive safe integer");
}

const gif = Buffer.from(
  (await readFile(new URL("../fixtures/gif/animation.hex", import.meta.url), "utf8")).trim(),
  "hex",
);
const png = Buffer.from(
  (await readFile(new URL("../fixtures/png/gradient.hex", import.meta.url), "utf8")).trim(),
  "hex",
);
const cases = [
  { engine: "gifsicle-compat-o3", input: gif, plugin: gifsicle({ optimizationLevel: 3 }) },
  { engine: "giflossless-native", input: gif, plugin: giflossless() },
  { engine: "optipng-shaped-level3", input: png, plugin: optipng() },
  { engine: "oxipng-native-level3", input: png, plugin: oxipng({ optimizationLevel: 3 }) },
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

function percentile(samples, ratio) {
  const index = Math.min(samples.length - 1, Math.floor(samples.length * ratio));
  return Number(samples[index].toFixed(4));
}
