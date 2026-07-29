import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { writePlatformSbom } from "./write-platform-sbom.mjs";

const workspaceRoot = new URL("../../", import.meta.url);
const installationRoot = requiredArgument("--installation-root");
const platformDirectory = currentPlatformDirectory();
const expectedPlatformDirectory = requiredArgument("--platform-directory");
assert.equal(platformDirectory, expectedPlatformDirectory);
const releaseVersion = requiredArgument("--release-version");

const requireFromInstallation = createRequire(resolve(installationRoot, "package.json"));
const entry = requireFromInstallation.resolve("imagemin-rs");
const api = await import(pathToFileURL(entry).href);
const sharpVersions = requireFromInstallation("sharp").versions;
const [gif, jpeg, png] = await Promise.all([
  readHexFixture("fixtures/gif/animation.hex"),
  readHexFixture("fixtures/jpeg/color-metadata.hex"),
  readHexFixture("fixtures/png/pngquant-rgba.hex"),
]);
const svg = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#f00"/></svg>',
);

const checks = [
  ["svgo", svg, api.svgo(), isSvg],
  ["svgm", svg, api.svgm(), isSvg],
  ["oxipng", png, api.oxipng(), isPng],
  ["optipng", png, api.optipng(), isPng],
  ["pngquant", png, api.pngquant({ speed: 11 }), isPng],
  ["gifsicle", gif, api.gifsicle({ optimizationLevel: 1 }), isGif],
  ["giflossless", gif, api.giflossless(), isGif],
  ["mozjpeg", jpeg, api.mozjpeg({ quality: 80 }), isJpeg],
  ["jpegtran", jpeg, api.jpegtran({ progressive: true }), isJpeg],
  ["webp", png, api.webp({ method: 0, quality: 80 }), isWebp],
  ["avif", png, api.avif({ effort: 0, quality: 80 }), isAvif],
];
const results = [];

for (const [name, input, plugin, validate] of checks) {
  const output = await api.default.buffer(input, { plugins: [plugin] });
  assert(output instanceof Uint8Array, `${name} returned a non-byte result`);
  assert(output.byteLength > 0, `${name} returned an empty result`);
  assert(validate(output), `${name} returned an unexpected format`);
  results.push({ inputBytes: input.byteLength, name, outputBytes: output.byteLength });
}

const report = {
  architecture: process.arch,
  node: process.version,
  platform: process.platform,
  platformDirectory,
  results,
  sharpVersions,
  version: releaseVersion,
};
const reportPath = readArgument("--report");
if (reportPath !== undefined) {
  await writeJson(reportPath, report);
}
const sbomPath = readArgument("--sbom");
if (sbomPath !== undefined) {
  await writePlatformSbom({
    installationRoot,
    outputPath: sbomPath,
    platformDirectory,
    releaseVersion,
    sharpVersions,
  });
}
console.log(JSON.stringify(report, undefined, 2));

async function readHexFixture(path) {
  const value = await readFile(new URL(path, workspaceRoot), "utf8");
  return Buffer.from(value.replaceAll(/\s+/gu, ""), "hex");
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, undefined, 2)}\n`);
}

function isSvg(value) {
  return Buffer.from(value).toString("utf8").includes("<svg");
}

function isPng(value) {
  return Buffer.from(value).subarray(0, 8).toString("hex") === "89504e470d0a1a0a";
}

function isGif(value) {
  return Buffer.from(value).subarray(0, 3).toString("ascii") === "GIF";
}

function isJpeg(value) {
  return Buffer.from(value).subarray(0, 2).toString("hex") === "ffd8";
}

function isWebp(value) {
  const buffer = Buffer.from(value);
  return (
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  );
}

function isAvif(value) {
  const buffer = Buffer.from(value);
  return (
    buffer.subarray(4, 8).toString("ascii") === "ftyp" &&
    buffer.subarray(8, Math.min(buffer.byteLength, 32)).includes(Buffer.from("avif"))
  );
}

function requiredArgument(name) {
  const value = readArgument(name);
  assert(value !== undefined, `${name} is required`);
  return value;
}

function readArgument(name) {
  const direct = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (direct !== undefined) return direct.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function currentPlatformDirectory() {
  assert(["arm64", "x64"].includes(process.arch), `Unsupported architecture: ${process.arch}`);
  if (process.platform === "darwin") return `darwin-${process.arch}`;
  if (process.platform === "win32") return `win32-${process.arch}-msvc`;
  if (process.platform === "linux") {
    const report_ = process.report?.getReport();
    const libc = report_?.header?.glibcVersionRuntime === undefined ? "musl" : "gnu";
    return `linux-${process.arch}-${libc}`;
  }
  throw new Error(`Unsupported platform: ${process.platform}`);
}
