import { spawn } from "node:child_process";

export function runBinary(binary, arguments_, input) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(binary, arguments_, { stdio: ["pipe", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.once("error", reject);
    child.stdin.on("error", (error) => {
      if (error.code !== "EPIPE") reject(error);
    });
    child.once("close", (code, signal) => {
      const result = {
        stderr: Buffer.concat(stderr),
        stdout: Buffer.concat(stdout),
      };
      if (code === 0) resolvePromise(result);
      else {
        reject(
          new Error(
            `${binary} failed with ${signal ?? `exit code ${code}`}: ${result.stderr.toString()}`,
          ),
        );
      }
    });
    child.stdin.end(input);
  });
}
