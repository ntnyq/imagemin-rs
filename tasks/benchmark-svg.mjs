import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

import { svgm, svgo } from "../packages/imagemin/dist/index.mjs";

const ITERATIONS = Number.parseInt(process.env.BENCH_ITERATIONS ?? "200", 10);
const WARMUP_ITERATIONS = 20;
const FIXTURES = ["basic-icon.svg", "defs-use.svg", "css-selectors.svg"];

if (!Number.isSafeInteger(ITERATIONS) || ITERATIONS < 1) {
  throw new TypeError("BENCH_ITERATIONS must be a positive safe integer");
}

const inputs = await Promise.all(
  FIXTURES.map(async (fixture) => ({
    data: await readFile(new URL(`../fixtures/svg/${fixture}`, import.meta.url)),
    fixture,
  })),
);

const engines = [
  { name: "svgo-4.0.2", plugin: svgo() },
  { name: "svgm-0.3.8-safe", plugin: svgm() },
];
const results = [];

for (const engine of engines) {
  for (const input of inputs) {
    for (let index = 0; index < WARMUP_ITERATIONS; index += 1) {
      await engine.plugin(input.data);
    }

    const samples = [];
    let outputBytes = 0;
    for (let index = 0; index < ITERATIONS; index += 1) {
      const start = performance.now();
      const output = await engine.plugin(input.data);
      samples.push(performance.now() - start);
      outputBytes = output.byteLength;
    }

    samples.sort((left, right) => left - right);
    results.push({
      engine: engine.name,
      fixture: input.fixture,
      inputBytes: input.data.byteLength,
      outputBytes,
      iterations: ITERATIONS,
      medianMilliseconds: percentile(samples, 0.5),
      p95Milliseconds: percentile(samples, 0.95),
    });
  }
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
