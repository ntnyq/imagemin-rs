import { readFile } from "node:fs/promises";

const manifest = JSON.parse(
  await readFile(new URL("../../packages/imagemin/package.json", import.meta.url), "utf8"),
);
const expectedRef = `refs/tags/v${manifest.version}`;
const actualRef = process.env.GITHUB_REF;

if (actualRef !== expectedRef) {
  throw new Error(`Release ref ${actualRef ?? "<unset>"} does not match ${expectedRef}`);
}
if (manifest.version === "0.0.0") {
  throw new Error("Release ref cannot use the 0.0.0 development version");
}

console.log(JSON.stringify({ ref: actualRef, version: manifest.version }, undefined, 2));
