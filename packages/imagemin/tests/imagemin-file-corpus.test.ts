import { basename, join } from "node:path";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { afterAll, beforeAll, describe, expect, test } from "vitest";
import upstreamImagemin from "imagemin";

import imagemin, { type ImageminPlugin } from "../src/index";

// File-level corpus differential against upstream `imagemin@9`. Codecs are
// replaced by cheap marker plugins so the comparison isolates path semantics:
// glob expansion, ordering, junk and dotfile filtering, destination
// flattening, extension rewrites and error propagation.

const WEBP_HEADER = [0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50];
const WEBP_BYTES = new Uint8Array([...WEBP_HEADER, 0x56, 0x50, 0x38, 0x20, ...new Uint8Array(16)]);
const AVIF_HEADER = [0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66];
const AVIF_BYTES = new Uint8Array([...AVIF_HEADER, 0x00, 0x00, 0x00, 0x00, ...new Uint8Array(16)]);

let corpus: string;
let scratch: string;

beforeAll(async () => {
  corpus = await mkdtemp(join(tmpdir(), "imagemin-rs-corpus-"));
  scratch = await mkdtemp(join(tmpdir(), "imagemin-rs-corpus-out-"));
  await mkdir(join(corpus, "nested", "deep"), { recursive: true });
  await mkdir(join(corpus, "other"), { recursive: true });
  const files: [string, Uint8Array][] = [
    ["a.bin", new Uint8Array([1])],
    ["multi.dot.name.bin", new Uint8Array([2])],
    ["noext", new Uint8Array([3])],
    ["empty.bin", new Uint8Array([])],
    ["UPPER.BIN", new Uint8Array([4])],
    ["bracket[1].bin", new Uint8Array([5])],
    ["space and (parens).bin", new Uint8Array([6])],
    [".hidden.bin", new Uint8Array([7])],
    [".DS_Store", new Uint8Array([8])],
    ["Thumbs.db", new Uint8Array([9])],
    [join("nested", "b.bin"), new Uint8Array([10])],
    [join("nested", "deep", "c.bin"), new Uint8Array([11])],
    [join("nested", "a.bin"), new Uint8Array([12])],
    [join("other", "a.bin"), new Uint8Array([13])],
  ];
  await Promise.all(files.map(([name, data]) => writeFile(join(corpus, name), data)));
});

afterAll(async () => {
  await Promise.all([
    rm(corpus, { force: true, recursive: true }),
    rm(scratch, { force: true, recursive: true }),
  ]);
});

describe("imagemin 9 file corpus differential", () => {
  test.each([
    ["recursive glob", ["**/*.bin"]],
    ["multiple patterns with overlap", ["*.bin", "**/a.bin", "nested/**/*.bin"]],
    ["negation pattern", ["**/*.bin", "!nested/deep/**"]],
    ["extensionless and uppercase literals as patterns", ["noext", "UPPER.BIN"]],
    ["names with spaces and parentheses", ["space and*.bin"]],
    ["character-class pattern", ["bracket[[]1[]].bin", "bracket*.bin"]],
    ["dotfile and junk are excluded by default glob", ["*.bin", ".*", "*.db"]],
    ["pattern matching nothing", ["missing/**/*.zzz"]],
    ["empty input", []],
  ])("matches upstream glob semantics: %s", async (_label, patterns) => {
    // Upstream inherits globby's nondeterministic multi-directory traversal
    // order, so glob-mode parity is set parity; ordered parity is only
    // defined for literal inputs. Our own glob order is pinned separately.
    const [actual, expected] = await Promise.all([
      runOurs(patterns, {}),
      runUpstream(patterns, {}),
    ]);

    expect(actual).toEqual(sortProjections(expected));
  });

  test("returns glob matches in deterministic sorted order", async () => {
    const first = await runOurs(["**/*.bin"], {});
    const second = await runOurs(["**/*.bin"], {});

    expect(first).toEqual(sortProjections(first));
    expect(second).toEqual(first);
    expect(first.length).toBeGreaterThan(0);
  });

  test("matches literal mode ordering, duplicates, dotfiles and junk filtering", async () => {
    const paths = [
      join(corpus, "nested", "b.bin"),
      join(corpus, "a.bin"),
      join(corpus, "a.bin"),
      join(corpus, ".hidden.bin"),
      join(corpus, ".DS_Store"),
      join(corpus, "Thumbs.db"),
      join(corpus, "empty.bin"),
    ];

    const [actual, expected] = await Promise.all([
      runOurs(paths, { glob: false }),
      runUpstream(paths, { glob: false }),
    ]);

    expect(actual).toEqual(expected);
  });

  test("matches plugin invocation counts across the corpus", async () => {
    let actualCalls = 0;
    let expectedCalls = 0;
    const count =
      (bump: () => void): ImageminPlugin =>
      (input) => {
        bump();
        return input;
      };

    await Promise.all([
      imagemin([join(corpus, "**/*.bin")], {
        plugins: [
          count(() => {
            actualCalls += 1;
          }),
        ],
      }),
      upstreamImagemin([toGlobInput(join(corpus, "**/*.bin"))], {
        plugins: [
          count(() => {
            expectedCalls += 1;
          }),
        ],
      }),
    ]);

    expect(actualCalls).toBe(expectedCalls);
    expect(actualCalls).toBeGreaterThan(0);
  });

  test("matches destination flattening, collisions and marker content", async () => {
    const actualDestination = join(scratch, "flat-actual");
    const expectedDestination = join(scratch, "flat-expected");
    const marker: ImageminPlugin = (input) => new Uint8Array([...input, 0xfe]);
    const patterns = ["a.bin", "nested/a.bin", "other/a.bin", "nested/deep/c.bin"];

    const [actual, expected] = await Promise.all([
      runOurs(patterns, { destination: actualDestination, plugins: [marker] }),
      runUpstream(patterns, { destination: expectedDestination, plugins: [marker] }),
    ]);

    expect(actual).toEqual(sortProjections(expected));
    expect(new Set(actual.map((entry) => entry.destinationBasename)).size).toBe(2);
    await expect(readFile(join(actualDestination, "c.bin"))).resolves.toEqual(
      Buffer.from([11, 0xfe]),
    );
    await expect(readFile(join(expectedDestination, "c.bin"))).resolves.toEqual(
      Buffer.from([11, 0xfe]),
    );
  });

  test("creates nested destination directories like upstream", async () => {
    const actualDestination = join(scratch, "deep-actual", "sub", "inner");
    const expectedDestination = join(scratch, "deep-expected", "sub", "inner");

    const [actual, expected] = await Promise.all([
      runOurs(["a.bin"], { destination: actualDestination }),
      runUpstream(["a.bin"], { destination: expectedDestination }),
    ]);

    expect(actual).toEqual(expected);
    await expect(readFile(join(actualDestination, "a.bin"))).resolves.toEqual(Buffer.from([1]));
  });

  test.each([
    ["multi-dot name", "multi.dot.name.bin", "multi.dot.name.webp"],
    ["extensionless name", "noext", "noext.webp"],
    ["uppercase extension", "UPPER.BIN", "UPPER.webp"],
  ])("matches upstream .webp rename for %s", async (_label, source, renamed) => {
    const toWebp: ImageminPlugin = () => WEBP_BYTES;
    const actualDestination = join(scratch, `webp-actual-${renamed}`);
    const expectedDestination = join(scratch, `webp-expected-${renamed}`);

    const [actual, expected] = await Promise.all([
      runOurs([source], { destination: actualDestination, plugins: [toWebp] }),
      runUpstream([source], { destination: expectedDestination, plugins: [toWebp] }),
    ]);

    expect(actual[0]?.destinationBasename).toBe(renamed);
    expect(actual).toEqual(expected);
  });

  test("documents the intended divergence: non-webp format changes rename by magic", async () => {
    // Upstream only rewrites the extension for WebP output; this package
    // renames by the final magic for every supported format (see docs/api).
    const toAvif: ImageminPlugin = () => AVIF_BYTES;
    const actualDestination = join(scratch, "avif-actual");
    const expectedDestination = join(scratch, "avif-expected");

    const [actual, expected] = await Promise.all([
      runOurs(["a.bin"], { destination: actualDestination, plugins: [toAvif] }),
      runUpstream(["a.bin"], { destination: expectedDestination, plugins: [toAvif] }),
    ]);

    expect(actual[0]?.destinationBasename).toBe("a.avif");
    expect(expected[0]?.destinationBasename).toBe("a.bin");
    expect(actual[0]?.data).toEqual(expected[0]?.data);
  });

  test.each([
    ["missing literal file", [join("does", "not", "exist.bin")], { glob: false as const }],
    ["directory as literal path", ["nested"], { glob: false as const }],
  ])("rejects like upstream for %s", async (_label, relativePaths, options) => {
    const paths = relativePaths.map((path) => join(corpus, path));

    await expect(imagemin(paths, options)).rejects.toThrow();
    await expect(upstreamImagemin(paths, options)).rejects.toThrow();
  });
});

type Projection = {
  data: number[];
  destinationBasename?: string;
  sourceBasename: string;
  sourcePath: string;
};

async function runOurs(
  patterns: readonly string[],
  options: Parameters<typeof imagemin>[1],
): Promise<Projection[]> {
  const results = await imagemin(patterns.map(toGlobInput), options);
  return results.map((entry) => project(entry));
}

async function runUpstream(
  patterns: readonly string[],
  options: Parameters<typeof imagemin>[1],
): Promise<Projection[]> {
  const results = await upstreamImagemin(patterns.map(toGlobInput), options);
  return results.map((entry) => project(entry));
}

// Patterns are corpus-relative; literal absolute paths pass through untouched.
// Windows absolute paths contain backslashes, which globby treats as escapes,
// so glob patterns are joined with forward slashes like upstream recommends.
function toGlobInput(pattern: string): string {
  if (pattern.startsWith("!")) {
    return `!${toGlobInput(pattern.slice(1))}`;
  }
  if (pattern.includes(tmpdir())) {
    return pattern;
  }
  return [corpus.replaceAll("\\", "/"), pattern].join("/");
}

function sortProjections(projections: readonly Projection[]): Projection[] {
  return [...projections].sort((left, right) =>
    left.sourcePath < right.sourcePath ? -1 : left.sourcePath > right.sourcePath ? 1 : 0,
  );
}

function project(entry: {
  data: Uint8Array;
  destinationPath?: string;
  sourcePath: string;
}): Projection {
  return {
    data: [...entry.data],
    sourceBasename: basename(entry.sourcePath),
    sourcePath: entry.sourcePath.replaceAll("\\", "/"),
    ...(entry.destinationPath === undefined
      ? {}
      : { destinationBasename: basename(entry.destinationPath) }),
  };
}
