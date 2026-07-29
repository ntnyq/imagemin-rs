import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

import { resolveSmokeWorkerCommand } from "./smoke-worker-command.mjs";
import { resolveSpawnCommand } from "./spawn-command.mjs";

const workspaceRoot = fileURLToPath(new URL("../../", import.meta.url));
const bundleDirectory = resolve(workspaceRoot, readArgument("--bundle") ?? ".release/npm");
const bundle = JSON.parse(
  await readFile(resolve(bundleDirectory, "release-manifest.json"), "utf8"),
);
const platformDirectory = currentPlatformDirectory();
const expectedPlatformDirectory = readArgument("--expected-platform");
assert(
  expectedPlatformDirectory === undefined || expectedPlatformDirectory === platformDirectory,
  `Expected ${expectedPlatformDirectory}, running on ${platformDirectory}`,
);
const expectedPackages = [
  "imagemin-rs",
  "@imagemin-rs/binding",
  `@imagemin-rs/binding-${platformDirectory}`,
  `@imagemin-rs/sidecar-gifsicle-${platformDirectory}`,
  `@imagemin-rs/sidecar-pngquant-${platformDirectory}`,
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
  await run(
    process.execPath,
    [
      fileURLToPath(new URL("./smoke-without-sharp.mjs", import.meta.url)),
      "--installation-root",
      temporaryRoot,
    ],
    { cwd: workspaceRoot },
  );
  await run(
    "npm",
    [
      "install",
      "--no-audit",
      "--no-fund",
      "--no-package-lock",
      "--save-exact",
      "--foreground-scripts",
      "sharp@0.35.3",
    ],
    {
      cwd: temporaryRoot,
      env: {
        ...process.env,
        npm_config_cache: resolve(temporaryRoot, ".npm-cache"),
      },
    },
  );
  const reportPath = readArgument("--report");
  const sbomPath = readArgument("--sbom");
  const worker = resolveSmokeWorkerCommand({
    installationRoot: temporaryRoot,
    platformDirectory,
    releaseVersion: bundle.version,
    reportPath: reportPath === undefined ? undefined : resolve(workspaceRoot, reportPath),
    sbomPath: sbomPath === undefined ? undefined : resolve(workspaceRoot, sbomPath),
  });
  await runExecutable(worker.command, worker.arguments, {
    cwd: workspaceRoot,
    env: {
      ...process.env,
      NAPI_RS_ENFORCE_VERSION_CHECK: "1",
    },
  });
} finally {
  await rm(temporaryRoot, { force: true, maxRetries: 5, recursive: true, retryDelay: 200 });
}

function run(command, arguments_, options) {
  const resolved = resolveSpawnCommand(command, arguments_);
  return runExecutable(resolved.command, resolved.arguments, options, command);
}

function runExecutable(command, arguments_, options, label = command) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, arguments_, { ...options, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${label} failed with ${signal ?? `exit code ${code}`}`));
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
