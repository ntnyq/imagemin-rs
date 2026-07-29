import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = fileURLToPath(new URL("../../", import.meta.url));
const bundleDirectory = resolve(workspaceRoot, readArgument("--bundle") ?? ".release/npm");
const mode = readArgument("--mode") ?? "dry-run";
if (!["dry-run", "publish"].includes(mode)) {
  throw new TypeError("--mode must be dry-run or publish");
}

const bundle = JSON.parse(
  await readFile(resolve(bundleDirectory, "release-manifest.json"), "utf8"),
);
if (bundle.version === "0.0.0" && mode !== "dry-run") {
  throw new Error("The 0.0.0 development version cannot be published");
}
if (bundle.packages.length !== 35) {
  throw new Error(`Expected 35 release packages, found ${bundle.packages.length}`);
}

const publicPackage = takePackage("imagemin-rs");
const bindingPackage = takePackage("@imagemin-rs/binding");
const wasmPackage = takePackage("@imagemin-rs/wasm");
const platformPackages = bundle.packages
  .filter(({ name }) => name.startsWith("@imagemin-rs/binding-"))
  .sort((left, right) => left.name.localeCompare(right.name));
if (platformPackages.length !== 8) {
  throw new Error(`Expected 8 platform packages, found ${platformPackages.length}`);
}
const sidecarPackages = bundle.packages
  .filter(({ name }) => name.startsWith("@imagemin-rs/sidecars-"))
  .sort((left, right) => left.name.localeCompare(right.name));
if (sidecarPackages.length !== 8) {
  throw new Error(`Expected 8 sidecar packages, found ${sidecarPackages.length}`);
}
const pngquantPackages = bundle.packages
  .filter(({ name }) => name.startsWith("@imagemin-rs/sidecar-pngquant-"))
  .sort((left, right) => left.name.localeCompare(right.name));
if (pngquantPackages.length !== 8) {
  throw new Error(`Expected 8 pngquant packages, found ${pngquantPackages.length}`);
}
const gifsiclePackages = bundle.packages
  .filter(({ name }) => name.startsWith("@imagemin-rs/sidecar-gifsicle-"))
  .sort((left, right) => left.name.localeCompare(right.name));
if (gifsiclePackages.length !== 8) {
  throw new Error(`Expected 8 gifsicle packages, found ${gifsiclePackages.length}`);
}

const distributionTag = bundle.version.includes("-") ? "next" : "latest";
const orderedPackages = [
  ...platformPackages,
  ...sidecarPackages,
  ...pngquantPackages,
  ...gifsiclePackages,
  wasmPackage,
  bindingPackage,
  publicPackage,
];
for (const descriptor of orderedPackages) {
  const tarballPath = resolve(bundleDirectory, descriptor.tarball);
  const tarball = await readFile(tarballPath);
  const integrity = `sha512-${createHash("sha512").update(tarball).digest("base64")}`;
  if (integrity !== descriptor.integrity) {
    throw new Error(`Integrity mismatch for ${descriptor.tarball}`);
  }

  const arguments_ = ["publish", tarballPath, "--access", "public", "--tag", distributionTag];
  if (mode === "dry-run") {
    console.log(`npm ${arguments_.join(" ")}`);
  } else {
    await run("npm", arguments_);
  }
}

console.log(
  JSON.stringify(
    {
      distributionTag,
      mode,
      packages: orderedPackages.map(({ name }) => name),
      version: bundle.version,
    },
    undefined,
    2,
  ),
);

function takePackage(name) {
  const descriptor = bundle.packages.find((entry) => entry.name === name);
  if (descriptor === undefined) throw new Error(`Release bundle does not contain ${name}`);
  return descriptor;
}

function run(command, arguments_) {
  const executable = process.platform === "win32" ? `${command}.cmd` : command;
  return new Promise((resolvePromise, reject) => {
    const child = spawn(executable, arguments_, { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${command} failed with ${signal ?? `exit code ${code}`}`));
    });
  });
}

function readArgument(name) {
  const direct = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (direct !== undefined) return direct.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}
