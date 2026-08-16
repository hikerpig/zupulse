import { spawn, type ChildProcess } from "node:child_process";
import { PdfOmrError } from "./errors";
import { startMonotonicTimer, startProcessResourceSampler, type ProcessResourceUsage } from "./resource-metrics";

export type EngineProcessRequest = {
  command: string;
  args: readonly string[];
  cwd?: string;
  env?: Readonly<Record<string, string>>;
  timeoutMs?: number;
  maxOutputBytes?: number;
  onStderrLine?: (line: string) => void;
};

export type EngineProcessResult = {
  exitCode: 0;
  stdout: string;
  stderr: string;
  durationMs: number;
  resourceUsage: ProcessResourceUsage;
};

const defaultTimeoutMs = 5 * 60_000;
const defaultMaxOutputBytes = 16 * 1024 * 1024;
const forceKillDelayMs = 250;

export function runEngineProcess(request: EngineProcessRequest, signal?: AbortSignal): Promise<EngineProcessResult> {
  if (signal?.aborted) return Promise.reject(new PdfOmrError("INTERRUPTED", "engine execution was interrupted"));
  const timeoutMs = request.timeoutMs ?? defaultTimeoutMs;
  const maxOutputBytes = request.maxOutputBytes ?? defaultMaxOutputBytes;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    return Promise.reject(
      new PdfOmrError("INVALID_CLI_ARGUMENT", "timeout must be a positive integer", {
        context: { timeoutMs },
      }),
    );
  }
  if (!Number.isSafeInteger(maxOutputBytes) || maxOutputBytes <= 0) {
    return Promise.reject(
      new PdfOmrError("INVALID_CLI_ARGUMENT", "output limit must be a positive integer", {
        context: { maxOutputBytes },
      }),
    );
  }

  return new Promise((resolve, reject) => {
    const timer = startMonotonicTimer();
    const child = spawn(request.command, [...request.args], {
      ...(request.cwd === undefined ? {} : { cwd: request.cwd }),
      ...(request.env === undefined ? {} : { env: { ...process.env, ...request.env } }),
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const resourceSampler = child.pid === undefined ? undefined : startProcessResourceSampler(child.pid);
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let capturedBytes = 0;
    let terminationError: PdfOmrError | undefined;
    let settled = false;
    let forceKillTimer: NodeJS.Timeout | undefined;

    const cleanup = () => {
      clearTimeout(timeoutTimer);
      if (forceKillTimer !== undefined) clearTimeout(forceKillTimer);
      signal?.removeEventListener("abort", onAbort);
      void resourceSampler?.stop();
    };
    const settleReject = (error: PdfOmrError) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const terminate = (error: PdfOmrError) => {
      if (terminationError !== undefined) return;
      terminationError = error;
      terminateProcessTree(child, "SIGTERM");
      forceKillTimer = setTimeout(() => terminateProcessTree(child, "SIGKILL"), forceKillDelayMs);
    };
    const capture = (target: Buffer[], chunk: Buffer) => {
      if (terminationError !== undefined) return;
      capturedBytes += chunk.byteLength;
      if (capturedBytes > maxOutputBytes) {
        terminate(
          new PdfOmrError("ENGINE_EXECUTION_FAILED", "engine output exceeded the configured limit", {
            context: { reason: "output-limit", maxOutputBytes },
          }),
        );
        return;
      }
      target.push(chunk);
    };
    const onAbort = () => terminate(new PdfOmrError("INTERRUPTED", "engine execution was interrupted"));
    const timeoutTimer = setTimeout(
      () =>
        terminate(
          new PdfOmrError("ENGINE_EXECUTION_FAILED", "engine execution timed out", {
            context: { reason: "timeout", timeoutMs },
          }),
        ),
      timeoutMs,
    );

    signal?.addEventListener("abort", onAbort, { once: true });
    const stderrDecoder = new TextDecoder("utf-8");
    let stderrLineBuffer = "";
    const acceptStderr = (chunk: Buffer) => {
      capture(stderr, chunk);
      if (request.onStderrLine === undefined) return;
      stderrLineBuffer += stderrDecoder.decode(chunk, { stream: true });
      let newline = stderrLineBuffer.indexOf("\n");
      while (newline >= 0) {
        const line = stderrLineBuffer.slice(0, newline);
        stderrLineBuffer = stderrLineBuffer.slice(newline + 1);
        try {
          request.onStderrLine(line);
        } catch {
          // Stream observers must not change engine execution.
        }
        newline = stderrLineBuffer.indexOf("\n");
      }
    };
    child.stdout.on("data", (chunk: Buffer) => capture(stdout, chunk));
    child.stderr.on("data", acceptStderr);
    child.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        settleReject(
          new PdfOmrError("ENGINE_UNAVAILABLE", "engine executable is unavailable", {
            context: { command: request.command },
            cause: error,
          }),
        );
        return;
      }
      settleReject(new PdfOmrError("ENGINE_EXECUTION_FAILED", "engine process could not start", { cause: error }));
    });
    child.on("close", async (exitCode) => {
      if (settled) return;
      const resourceUsage = (await resourceSampler?.stop()) ?? {
        scope: "process-group",
        sampleIntervalMs: 250,
        sampleCount: 0,
      };
      if (terminationError !== undefined) {
        settleReject(terminationError);
        return;
      }
      if (exitCode !== 0) {
        settleReject(
          new PdfOmrError("ENGINE_EXECUTION_FAILED", "engine process exited unsuccessfully", {
            context: { reason: "non-zero-exit", exitCode },
          }),
        );
        return;
      }
      settled = true;
      cleanup();
      resolve({
        exitCode: 0,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
        durationMs: timer.elapsedMs(),
        resourceUsage,
      });
    });
  });
}

function terminateProcessTree(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid === undefined || child.exitCode !== null || child.killed) return;
  try {
    if (process.platform === "win32") child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch {
    child.kill(signal);
  }
}
