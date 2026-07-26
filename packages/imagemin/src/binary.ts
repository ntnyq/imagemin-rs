import { spawn } from "node:child_process";

import { ImageminError, throwIfAborted } from "./errors";

export interface BinaryLimits {
  outputBytes: number;
  stderrBytes: number;
  timeoutMilliseconds: number;
}

interface RunBinaryOptions {
  arguments: readonly string[];
  binary: string;
  displayName: string;
  input: Uint8Array;
  limits: BinaryLimits;
  signal?: AbortSignal | undefined;
}

export class BinaryExitError extends Error {
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stderr: string;

  constructor(
    displayName: string,
    exitCode: number | null,
    signal: NodeJS.Signals | null,
    stderr: string,
  ) {
    const status = exitCode ?? signal ?? "an unknown status";
    super(`${displayName} exited with ${status}${stderr ? `: ${stderr}` : ""}`);
    this.name = "BinaryExitError";
    this.exitCode = exitCode;
    this.signal = signal;
    this.stderr = stderr;
  }
}

export async function runBinary({
  arguments: arguments_,
  binary,
  displayName,
  input,
  limits,
  signal,
}: RunBinaryOptions): Promise<Uint8Array> {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const child = spawn(binary, arguments_, {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;

    const cleanup = () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    };

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      fail(
        new Error(`${displayName} exceeded the ${limits.timeoutMilliseconds} ms execution limit`),
      );
    }, limits.timeoutMilliseconds);
    const abort = () => {
      child.kill("SIGKILL");
      fail(
        new ImageminError("ERR_IMAGEMIN_ABORTED", `${displayName} execution was aborted`, {
          cause: signal?.reason,
        }),
      );
    };

    signal?.addEventListener("abort", abort, { once: true });

    child.once("error", fail);
    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.byteLength;
      if (stdoutBytes > limits.outputBytes) {
        child.kill("SIGKILL");
        fail(new Error(`${displayName} output exceeds the ${limits.outputBytes} byte limit`));
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.byteLength;
      if (stderrBytes > limits.stderrBytes) {
        child.kill("SIGKILL");
        fail(new Error(`${displayName} stderr exceeds the ${limits.stderrBytes} byte limit`));
        return;
      }
      stderr.push(chunk);
    });
    child.once("close", (code, signal) => {
      if (settled) return;
      if (code !== 0) {
        fail(
          new BinaryExitError(
            displayName,
            code,
            signal,
            Buffer.concat(stderr, stderrBytes).toString().trim(),
          ),
        );
        return;
      }

      settled = true;
      cleanup();
      resolve(new Uint8Array(Buffer.concat(stdout, stdoutBytes)));
    });
    child.stdin.on("error", (error: NodeJS.ErrnoException) => {
      // If the executable intentionally exits before consuming every byte,
      // `close` carries the useful exit status (for example pngquant's 99).
      if (error.code !== "EPIPE") fail(error);
    });
    child.stdin.end(Buffer.from(input.buffer, input.byteOffset, input.byteLength));
  });
}
