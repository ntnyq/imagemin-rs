import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const workspaceRoot = new URL("../../", import.meta.url);

test("publishes version-matched OpenVEX statements with required justifications", async () => {
  const [manifest, vex] = await Promise.all([
    readJson(new URL("package.json", workspaceRoot)),
    readJson(new URL("security/imagemin-rs.openvex.json", workspaceRoot)),
  ]);

  assert.equal(vex["@context"], "https://openvex.dev/ns/v0.2.0");
  assert.match(vex["@id"], new RegExp(`${escapeRegExp(manifest.version)}$`, "u"));
  assert.deepEqual(
    vex.statements.map(({ vulnerability }) => vulnerability.name),
    ["CVE-2023-2804", "CVE-2026-11979"],
  );
  for (const statement of vex.statements) {
    assert.equal(statement.status, "not_affected");
    assert.match(statement.justification, /^vulnerable_code_/u);
    assert(statement.products.length > 0);
    for (const product of statement.products) {
      assert(product["@id"].endsWith(`@${manifest.version}`));
      assert(product.subcomponents.length > 0);
    }
  }
});

test("release smoke rejects an installed xmlcatalog command", async () => {
  const smokeWorker = await readFile(
    new URL("tasks/release/smoke-installed-package.mjs", workspaceRoot),
    "utf8",
  );

  assert.match(smokeWorker, /assertSharpCommandAbsent\("xmlcatalog"\)/u);
});

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function escapeRegExp(value) {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
