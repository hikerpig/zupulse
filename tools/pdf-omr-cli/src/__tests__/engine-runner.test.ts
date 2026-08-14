import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runEngineProcess } from "../engine-runner";
import { PdfOmrError } from "../errors";

const fakeEngine = fileURLToPath(new URL("./fixtures/fake-engine.mjs", import.meta.url));

describe("engine process runner", () => {
  it("captures bounded output and execution duration", async () => {
    const result = await runEngineProcess({
      command: process.execPath,
      args: [fakeEngine, "success"],
      maxOutputBytes: 1024,
    });

    expect(result).toMatchObject({
      exitCode: 0,
      stdout: "recognized\n",
      stderr: "diagnostic\n",
    });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("samples the engine process group while it runs", async () => {
    const result = await runEngineProcess({
      command: process.execPath,
      args: [fakeEngine, "resource-usage"],
    });

    expect(result.resourceUsage).toMatchObject({ scope: "process-group" });
    expect(result.resourceUsage.sampleCount).toBeGreaterThan(0);
    expect(result.resourceUsage.peakRssBytes).toBeGreaterThan(80 * 1024 * 1024);
    expect(result.resourceUsage.averageCpuPercent).toBeGreaterThanOrEqual(0);
    expect(result.resourceUsage.peakCpuPercent).toBeGreaterThanOrEqual(0);
  });

  it("distinguishes a missing executable from engine failure", async () => {
    await expect(
      runEngineProcess({ command: "definitely-missing-pdf-omr-engine", args: [] }),
    ).rejects.toMatchObject<PdfOmrError>({ code: "ENGINE_UNAVAILABLE" });
  });

  it("reports non-zero exit without exposing output in error context", async () => {
    await expect(runEngineProcess({ command: process.execPath, args: [fakeEngine, "fail"] })).rejects.toSatisfy(
      (error: unknown) => {
        expect(error).toMatchObject<PdfOmrError>({
          code: "ENGINE_EXECUTION_FAILED",
          context: { reason: "non-zero-exit", exitCode: 7 },
        });
        expect(JSON.stringify(error)).not.toContain("sensitive stderr");
        return true;
      },
    );
  });

  it("terminates a hanging process when the timeout expires", async () => {
    await expect(
      runEngineProcess({
        command: process.execPath,
        args: [fakeEngine, "hang"],
        timeoutMs: 50,
      }),
    ).rejects.toMatchObject<PdfOmrError>({
      code: "ENGINE_EXECUTION_FAILED",
      context: { reason: "timeout" },
    });
  });

  it("force-kills a process that ignores graceful termination", async () => {
    await expect(
      runEngineProcess({
        command: process.execPath,
        args: [fakeEngine, "ignore-term"],
        timeoutMs: 50,
      }),
    ).rejects.toMatchObject<PdfOmrError>({
      code: "ENGINE_EXECUTION_FAILED",
      context: { reason: "timeout" },
    });
  }, 2000);

  it("terminates the process when aborted", async () => {
    const controller = new AbortController();
    const running = runEngineProcess(
      {
        command: process.execPath,
        args: [fakeEngine, "hang"],
      },
      controller.signal,
    );
    setTimeout(() => controller.abort(), 25);

    await expect(running).rejects.toMatchObject<PdfOmrError>({ code: "INTERRUPTED" });
  });

  it("fails when captured output exceeds the configured limit", async () => {
    await expect(
      runEngineProcess({
        command: process.execPath,
        args: [fakeEngine, "large-output"],
        maxOutputBytes: 32,
      }),
    ).rejects.toMatchObject<PdfOmrError>({
      code: "ENGINE_EXECUTION_FAILED",
      context: { reason: "output-limit" },
    });
  });
});
