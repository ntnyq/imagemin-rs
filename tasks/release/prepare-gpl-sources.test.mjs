import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { test } from "node:test";

const execFileAsync = promisify(execFile);
const script = fileURLToPath(new URL("./prepare-gpl-sources.mjs", import.meta.url));

test("copies verified GPL source inputs and records their release evidence", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "imagemin-gpl-sources-"));
  context.after(() => rm(root, { force: true, recursive: true }));
  const sources = join(root, "sources");
  const output = join(root, "output");
  await mkdir(sources);

  const fixtures = {
    "gifsicle-1.96.tar.gz": Buffer.from("gifsicle source"),
    "libimagequant-commit.tar.gz": Buffer.from("libimagequant source"),
    "pngquant-3.0.3.tar.gz": Buffer.from("pngquant source"),
  };
  for (const [filename, body] of Object.entries(fixtures)) {
    await writeFile(join(sources, filename), body);
  }

  const pins = {
    gifsicle: {
      sources: {
        gifsicle: source("1.96", fixtures["gifsicle-1.96.tar.gz"]),
      },
    },
    pngquant: {
      sources: {
        libimagequant: source("commit", fixtures["libimagequant-commit.tar.gz"]),
        pngquant: source("3.0.3", fixtures["pngquant-3.0.3.tar.gz"]),
      },
    },
  };
  const pinsPath = join(root, "pins.json");
  const packagePath = join(root, "package.json");
  await writeFile(pinsPath, JSON.stringify(pins));
  await writeFile(packagePath, JSON.stringify({ version: "1.2.3-rc.4" }));

  await execFileAsync(process.execPath, [
    script,
    "--sources",
    sources,
    "--output",
    output,
    "--pins",
    pinsPath,
    "--package",
    packagePath,
  ]);

  const manifest = JSON.parse(await readFile(join(output, "gpl-source-manifest.json"), "utf8"));
  assert.equal(manifest.version, "1.2.3-rc.4");
  assert.deepEqual(
    manifest.sources.map(({ filename, tool }) => ({ filename, tool })),
    [
      { filename: "gifsicle-1.96.tar.gz", tool: "gifsicle" },
      { filename: "libimagequant-commit.tar.gz", tool: "pngquant" },
      { filename: "pngquant-3.0.3.tar.gz", tool: "pngquant" },
    ],
  );
  const readme = await readFile(join(output, "GPL-SOURCE-README.md"), "utf8");
  assert.match(readme, /GPL source inputs for v1\.2\.3-rc\.4/u);
  assert.match(readme, /blob\/v1\.2\.3-rc\.4\/tasks\/sidecars\/build-pngquant\.sh/u);
  for (const filename of Object.keys(fixtures)) {
    assert.deepEqual(await readFile(join(output, filename)), fixtures[filename]);
  }
});

test("rejects a source archive that differs from its pin", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "imagemin-gpl-sources-mismatch-"));
  context.after(() => rm(root, { force: true, recursive: true }));
  const sources = join(root, "sources");
  await mkdir(sources);
  await writeFile(join(sources, "gifsicle-1.96.tar.gz"), "wrong source");
  await writeFile(join(sources, "libimagequant-commit.tar.gz"), "libimagequant source");
  await writeFile(join(sources, "pngquant-3.0.3.tar.gz"), "pngquant source");
  const pinsPath = join(root, "pins.json");
  const packagePath = join(root, "package.json");
  await writeFile(
    pinsPath,
    JSON.stringify({
      gifsicle: { sources: { gifsicle: source("1.96", Buffer.from("expected source")) } },
      pngquant: {
        sources: {
          libimagequant: source("commit", Buffer.from("libimagequant source")),
          pngquant: source("3.0.3", Buffer.from("pngquant source")),
        },
      },
    }),
  );
  await writeFile(packagePath, JSON.stringify({ version: "1.2.3" }));

  await assert.rejects(
    execFileAsync(process.execPath, [
      script,
      "--sources",
      sources,
      "--output",
      join(root, "output"),
      "--pins",
      pinsPath,
      "--package",
      packagePath,
    ]),
    /gifsicle-1\.96\.tar\.gz checksum mismatch/u,
  );
});

function source(version, body) {
  return {
    sha256: createHash("sha256").update(body).digest("hex"),
    url: `https://example.com/${version}.tar.gz`,
    version,
  };
}
