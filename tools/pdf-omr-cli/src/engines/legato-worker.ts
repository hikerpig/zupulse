import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { z } from "zod";
import { PdfOmrError } from "../errors";
import {
  combineProcessResourceUsage,
  startMonotonicTimer,
  startProcessResourceSampler,
  type ProcessResourceUsage,
} from "../resource-metrics";

export type LegatoWorkerOptions = {
  command: string;
  args: readonly string[];
  environment?: Readonly<Record<string, string>>;
  timeoutMs: number;
};

export type LegatoWorkerRequest = {
  inputPath: string;
  pageOutputDirectory: string;
  telemetryOutputPath: string;
  signal?: AbortSignal;
};

export type LegatoWorkerResult = {
  durationMs: number;
  requestDurationMs: number;
  modelLoadMs?: number;
  warm: boolean;
  resourceUsage: ProcessResourceUsage;
};

const workerResultMessageSchema = z.discriminatedUnion("ok", [
  z.object({ type: z.literal("result"), id: z.number().int().positive(), ok: z.literal(true) }).strict(),
  z
    .object({ type: z.literal("result"), id: z.number().int().positive(), ok: z.literal(false), reason: z.string() })
    .strict(),
]);
const workerMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ready"), modelLoadMs: z.number().finite().nonnegative() }).strict(),
  workerResultMessageSchema,
]);

type WorkerMessage = z.infer<typeof workerMessageSchema>;

export class LegatoWorker {
  readonly #options: LegatoWorkerOptions;
  #child: ChildProcessWithoutNullStreams | undefined;
  #buffer = "";
  #messageWaiter: { resolve: (message: WorkerMessage) => void; reject: (error: PdfOmrError) => void } | undefined;
  #requestId = 0;
  #running = false;

  constructor(options: LegatoWorkerOptions) {
    this.#options = options;
  }

  async run(request: LegatoWorkerRequest): Promise<LegatoWorkerResult> {
    if (this.#running) throw new PdfOmrError("ENGINE_EXECUTION_FAILED", "LEGATO worker is busy");
    this.#running = true;
    const totalTimer = startMonotonicTimer();
    try {
      const startup = this.#child === undefined ? await this.#start(request.signal) : undefined;
      const child = this.#child!;
      const sampler = startProcessResourceSampler(child.pid!);
      const requestTimer = startMonotonicTimer();
      const id = ++this.#requestId;
      const responsePromise = this.#nextMessage(request.signal);
      child.stdin.write(
        `${JSON.stringify({
          type: "recognize",
          id,
          inputPath: request.inputPath,
          pageOutputDirectory: request.pageOutputDirectory,
          telemetryOutputPath: request.telemetryOutputPath,
        })}\n`,
      );
      let response: WorkerMessage;
      let requestResourceUsage: ProcessResourceUsage;
      try {
        response = await responsePromise;
      } finally {
        requestResourceUsage = await sampler.stop();
      }
      if (response.type !== "result" || response.id !== id || !response.ok) {
        await this.close();
        throw new PdfOmrError("ENGINE_EXECUTION_FAILED", "LEGATO worker request failed", {
          context: { reason: response.type === "result" && !response.ok ? response.reason : "invalid-worker-response" },
        });
      }
      return {
        durationMs: totalTimer.elapsedMs(),
        requestDurationMs: requestTimer.elapsedMs(),
        ...(startup === undefined ? {} : { modelLoadMs: startup.modelLoadMs }),
        warm: startup === undefined,
        resourceUsage:
          startup === undefined
            ? requestResourceUsage
            : combineProcessResourceUsage([startup.resourceUsage, requestResourceUsage])!,
      };
    } catch (error) {
      await this.close();
      throw error;
    } finally {
      this.#running = false;
    }
  }

  async close(): Promise<void> {
    const child = this.#child;
    this.#child = undefined;
    this.#messageWaiter = undefined;
    this.#buffer = "";
    if (child === undefined || child.exitCode !== null) return;
    child.stdin.write(`${JSON.stringify({ type: "shutdown" })}\n`);
    child.stdin.end();
    await new Promise<void>((resolve) => {
      const force = setTimeout(() => terminate(child), 250);
      child.once("close", () => {
        clearTimeout(force);
        resolve();
      });
    });
  }

  async #start(signal?: AbortSignal): Promise<{ modelLoadMs: number; resourceUsage: ProcessResourceUsage }> {
    const child = spawn(this.#options.command, [...this.#options.args], {
      env: { ...process.env, ...this.#options.environment },
      detached: process.platform !== "win32",
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.#child = child;
    child.stdin.on("error", () => undefined);
    child.stderr.resume();
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => this.#acceptOutput(chunk));
    child.on("error", () => this.#fail(new PdfOmrError("ENGINE_UNAVAILABLE", "LEGATO worker could not start")));
    child.on("close", () => this.#fail(new PdfOmrError("ENGINE_EXECUTION_FAILED", "LEGATO worker exited")));
    const sampler = startProcessResourceSampler(child.pid!);
    let message: WorkerMessage;
    let resourceUsage: ProcessResourceUsage;
    try {
      message = await this.#nextMessage(signal);
    } finally {
      resourceUsage = await sampler.stop();
    }
    if (message.type !== "ready" || !Number.isFinite(message.modelLoadMs) || message.modelLoadMs < 0) {
      throw new PdfOmrError("ENGINE_OUTPUT_INVALID", "LEGATO worker ready message is invalid");
    }
    return { modelLoadMs: message.modelLoadMs, resourceUsage };
  }

  #nextMessage(signal?: AbortSignal): Promise<WorkerMessage> {
    if (signal?.aborted) return Promise.reject(new PdfOmrError("INTERRUPTED", "engine execution was interrupted"));
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () =>
          reject(
            new PdfOmrError("ENGINE_EXECUTION_FAILED", "LEGATO worker timed out", { context: { reason: "timeout" } }),
          ),
        this.#options.timeoutMs,
      );
      const onAbort = () => reject(new PdfOmrError("INTERRUPTED", "engine execution was interrupted"));
      signal?.addEventListener("abort", onAbort, { once: true });
      this.#messageWaiter = {
        resolve: (message) => {
          clearTimeout(timeout);
          signal?.removeEventListener("abort", onAbort);
          this.#messageWaiter = undefined;
          resolve(message);
        },
        reject: (error) => {
          clearTimeout(timeout);
          signal?.removeEventListener("abort", onAbort);
          this.#messageWaiter = undefined;
          reject(error);
        },
      };
    });
  }

  #acceptOutput(chunk: string): void {
    this.#buffer += chunk;
    const newline = this.#buffer.indexOf("\n");
    if (newline < 0) return;
    const line = this.#buffer.slice(0, newline);
    this.#buffer = this.#buffer.slice(newline + 1);
    try {
      this.#messageWaiter?.resolve(workerMessageSchema.parse(JSON.parse(line)));
    } catch {
      this.#fail(new PdfOmrError("ENGINE_OUTPUT_INVALID", "LEGATO worker emitted an invalid protocol message"));
    }
  }

  #fail(error: PdfOmrError): void {
    this.#messageWaiter?.reject(error);
  }
}

function terminate(child: ChildProcessWithoutNullStreams): void {
  try {
    if (process.platform === "win32") child.kill("SIGKILL");
    else process.kill(-child.pid!, "SIGKILL");
  } catch {
    child.kill("SIGKILL");
  }
}
