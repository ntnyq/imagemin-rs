import { execFile, spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { delimiter, dirname, join } from "node:path";
import { promisify } from "node:util";

const executeFile = promisify(execFile);
const environment = { ...process.env };
const rustc = await resolveRustupRustc();

if (rustc !== undefined) {
  environment.PATH = `${dirname(rustc)}${delimiter}${environment.PATH ?? ""}`;
}

if (process.platform === "darwin" && environment.CC_wasm32_unknown_unknown === undefined) {
  const clang = await resolveHomebrewClang();
  if (clang !== undefined) environment.CC_wasm32_unknown_unknown = clang;
}

const executable = process.platform === "win32" ? "wasm-pack.exe" : "wasm-pack";
const arguments_ = [
  "build",
  "../imagemin-core",
  "--target",
  "web",
  "--out-dir",
  "../imagemin/src/generated",
  "--out-name",
  "imagemin_wasm_core",
  "--",
  "--locked",
];
const exitCode = await run(executable, arguments_, environment);
if (exitCode !== 0) process.exitCode = exitCode;

async function resolveRustupRustc() {
  try {
    const { stdout } = await executeFile("rustup", ["which", "rustc"]);
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

async function resolveHomebrewClang() {
  const candidates = [];

  try {
    const { stdout } = await executeFile("brew", ["--prefix", "llvm"]);
    const prefix = stdout.trim();
    if (prefix) candidates.push(join(prefix, "bin", "clang"));
  } catch {
    // Fall through to the standard Homebrew prefixes.
  }

  candidates.push("/opt/homebrew/opt/llvm/bin/clang", "/usr/local/opt/llvm/bin/clang");
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Continue looking for a clang build with the WebAssembly backend.
    }
  }

  return undefined;
}

function run(command, arguments_, env) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, arguments_, {
      env,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal !== null) {
        reject(new Error(`${command} terminated with signal ${signal}`));
        return;
      }
      resolvePromise(code ?? 1);
    });
  });
}
