import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const installationRoot = resolve(readArgument("--installation-root"));
const packageRoot = resolve(installationRoot, "node_modules/imagemin-rs");
const manifest = JSON.parse(await readFile(resolve(packageRoot, "package.json"), "utf8"));

assert(manifest.dependencies?.sharp === undefined, "Sharp is still a production dependency");
assert.deepEqual(manifest.peerDependencies, { sharp: "0.35.3" });
assert.deepEqual(manifest.peerDependenciesMeta, { sharp: { optional: true } });

let sharpWasResolved = true;
try {
  createRequire(resolve(packageRoot, "package.json")).resolve("sharp");
} catch {
  sharpWasResolved = false;
}
assert(!sharpWasResolved, "Sharp was installed in the default package closure");

const { avif, svgo } = await import(pathToFileURL(resolve(packageRoot, "dist/index.mjs")).href);
const junk = Buffer.from("not an image");
assert.equal(await avif()(junk), junk, "AVIF identity input should not require Sharp");
assert.equal(await svgo()(junk), junk, "Non-AVIF plugins must work without Sharp");

const fixture = await readFile(
  new URL("../../fixtures/png/pngquant-rgba.hex", import.meta.url),
  "utf8",
);
const png = Buffer.from(fixture.replaceAll(/\s/gu, ""), "hex");
await assert.rejects(
  avif()(png),
  (error) =>
    error?.code === "ERR_IMAGEMIN_CODEC" &&
    error?.plugin === "avif" &&
    error?.message.includes("pnpm add sharp@0.35.3"),
  "Convertible AVIF input did not report the optional Sharp installation command",
);

console.log(
  JSON.stringify(
    {
      avifWithoutSharp: "structured-error",
      defaultSharpInstall: false,
      package: manifest.name,
      sharpPeer: manifest.peerDependencies.sharp,
      version: manifest.version,
    },
    undefined,
    2,
  ),
);

function readArgument(name) {
  const direct = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (direct !== undefined) return direct.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  const value = index === -1 ? undefined : process.argv[index + 1];
  if (value === undefined) {
    throw new TypeError("Usage: node smoke-without-sharp.mjs --installation-root <dir>");
  }
  return value;
}
