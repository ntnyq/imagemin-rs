import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

const workspaceRoot = fileURLToPath(new URL("../../", import.meta.url));
const bundleDirectory = resolve(workspaceRoot, readArgument("--bundle") ?? ".release/npm");
const bundle = JSON.parse(
  await readFile(resolve(bundleDirectory, "release-manifest.json"), "utf8"),
);
const platformDirectory = currentPlatformDirectory();
const expectedPackages = [
  "imagemin-rs",
  "@imagemin-rs/binding",
  `@imagemin-rs/binding-${platformDirectory}`,
  `@imagemin-rs/sidecars-${platformDirectory}`,
];
const packageFiles = Object.fromEntries(
  expectedPackages.map((name) => {
    const descriptor = bundle.packages.find((entry) => entry.name === name);
    assert(descriptor !== undefined, `Release bundle does not contain ${name}`);
    return [name, pathToFileURL(resolve(bundleDirectory, descriptor.tarball)).href];
  }),
);

const temporaryRoot = await mkdtemp(resolve(tmpdir(), "imagemin-rs-smoke-"));
try {
  await writeFile(
    resolve(temporaryRoot, "package.json"),
    `${JSON.stringify(
      {
        dependencies: packageFiles,
        name: "imagemin-rs-release-smoke",
        private: true,
        type: "module",
        version: "0.0.0",
      },
      undefined,
      2,
    )}\n`,
  );
  await run(
    "npm",
    ["install", "--no-audit", "--no-fund", "--no-package-lock", "--foreground-scripts"],
    {
      cwd: temporaryRoot,
      env: {
        ...process.env,
        NAPI_RS_ENFORCE_VERSION_CHECK: "1",
        npm_config_cache: resolve(temporaryRoot, ".npm-cache"),
      },
    },
  );

  const requireFromInstallation = createRequire(resolve(temporaryRoot, "package.json"));
  const entry = requireFromInstallation.resolve("imagemin-rs");
  const api = await import(pathToFileURL(entry).href);
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

  console.log(
    JSON.stringify(
      {
        architecture: process.arch,
        node: process.version,
        platform: process.platform,
        platformDirectory,
        results,
        version: bundle.version,
      },
      undefined,
      2,
    ),
  );
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}

async function readHexFixture(path) {
  const value = await readFile(resolve(workspaceRoot, path), "utf8");
  return Buffer.from(value.replaceAll(/\s+/gu, ""), "hex");
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

function run(command, arguments_, options) {
  const executable = process.platform === "win32" ? `${command}.cmd` : command;
  return new Promise((resolvePromise, reject) => {
    const child = spawn(executable, arguments_, { ...options, stdio: "inherit" });
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

function currentPlatformDirectory() {
  assert(["arm64", "x64"].includes(process.arch), `Unsupported architecture: ${process.arch}`);
  if (process.platform === "darwin") return `darwin-${process.arch}`;
  if (process.platform === "win32") return `win32-${process.arch}-msvc`;
  if (process.platform === "linux") {
    const report = process.report?.getReport();
    const libc = report?.header?.glibcVersionRuntime === undefined ? "musl" : "gnu";
    return `linux-${process.arch}-${libc}`;
  }
  throw new Error(`Unsupported platform: ${process.platform}`);
}
