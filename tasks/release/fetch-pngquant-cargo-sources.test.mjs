import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { test } from "node:test";

const execFileAsync = promisify(execFile);
const script = fileURLToPath(new URL("./fetch-pngquant-cargo-sources.mjs", import.meta.url));

test("downloads and verifies every registry source in the pngquant lockfile", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "imagemin-pngquant-cargo-sources-"));
  context.after(() => rm(root, { force: true, recursive: true }));

  const archives = {
    "alpha-1.2.3.crate": Buffer.from("alpha source"),
    "beta-2.0.0-rc.1.crate": Buffer.from("beta source"),
  };
  const server = createServer((request, response) => {
    const filename = request.url?.split("/").at(-1);
    const body = filename === undefined ? undefined : archives[filename];
    if (body === undefined) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "content-length": body.byteLength }).end(body);
  });
  await new Promise((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
  context.after(() => server.close());

  const address = server.address();
  assert(address !== null && typeof address === "object");
  const lockPath = join(root, "Cargo.lock");
  const output = join(root, "output");
  await writeFile(
    lockPath,
    [
      "version = 3",
      cargoPackage("alpha", "1.2.3", archives["alpha-1.2.3.crate"]),
      cargoPackage("beta", "2.0.0-rc.1", archives["beta-2.0.0-rc.1.crate"]),
      '[[package]]\nname = "workspace-package"\nversion = "1.0.0"\n',
    ].join("\n\n"),
  );

  await execFileAsync(process.execPath, [
    script,
    "--lock",
    lockPath,
    "--output",
    output,
    "--registry-base",
    `http://127.0.0.1:${address.port}/crates`,
  ]);

  const manifest = JSON.parse(await readFile(join(output, "cargo-source-manifest.json"), "utf8"));
  assert.equal(manifest.schema, 1);
  assert.deepEqual(
    manifest.packages.map(({ filename, sha256 }) => ({ filename, sha256 })),
    Object.entries(archives).map(([filename, body]) => ({
      filename,
      sha256: digest(body),
    })),
  );
  for (const [filename, body] of Object.entries(archives)) {
    assert.deepEqual(await readFile(join(output, filename)), body);
  }
});

test("rejects a crate archive that differs from Cargo.lock", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "imagemin-pngquant-cargo-mismatch-"));
  context.after(() => rm(root, { force: true, recursive: true }));
  const server = createServer((_request, response) => response.end("wrong source"));
  await new Promise((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
  context.after(() => server.close());

  const address = server.address();
  assert(address !== null && typeof address === "object");
  const lockPath = join(root, "Cargo.lock");
  await writeFile(lockPath, cargoPackage("alpha", "1.2.3", Buffer.from("expected source")));

  await assert.rejects(
    execFileAsync(process.execPath, [
      script,
      "--lock",
      lockPath,
      "--output",
      join(root, "output"),
      "--registry-base",
      `http://127.0.0.1:${address.port}/crates`,
    ]),
    /alpha-1\.2\.3\.crate checksum mismatch/u,
  );
});

function cargoPackage(name, version, body) {
  return `[[package]]
name = "${name}"
version = "${version}"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "${digest(body)}"`;
}

function digest(body) {
  return createHash("sha256").update(body).digest("hex");
}
