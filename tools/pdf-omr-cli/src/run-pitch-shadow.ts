import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson, sha256Bytes } from "./canonical-json";
import { runEngineProcess } from "./engine-runner";
import { PdfOmrError } from "./errors";
import { buildPitchShadowReport, pitchSourceSchema } from "./pitch-shadow";
import type { OmrScoreDraft } from "./schemas";

export async function runPitchShadow(
  inputPath: string,
  draft: OmrScoreDraft,
  pythonExecutable: string,
  signal?: AbortSignal,
) {
  const runnerPath = fileURLToPath(new URL("../engines/pitch_shadow.py", import.meta.url));
  let extractorSha256: string | null = null;
  let failureStage = "extractor-resource";
  let runtimeDirectory: string | undefined;
  try {
    const scriptBytes = await readFile(runnerPath);
    extractorSha256 = sha256Bytes(scriptBytes);
    // Electron can read ASAR resources, but external Python cannot; execute the exact hashed bytes outside it.
    runtimeDirectory = await mkdtemp(join(tmpdir(), "pdf-omr-pitch-"));
    const executableScript = join(runtimeDirectory, "pitch_shadow.py");
    await writeFile(executableScript, scriptBytes, { flag: "wx", mode: 0o600 });
    failureStage = "extractor-process";
    const result = await runEngineProcess(
      {
        command: pythonExecutable,
        args: [executableScript, inputPath],
        timeoutMs: 30_000,
        maxOutputBytes: 4 * 1024 * 1024,
      },
      signal,
    );
    failureStage = "extractor-evidence";
    const source = pitchSourceSchema.parse(JSON.parse(result.stdout));
    const report = buildPitchShadowReport(draft, source, extractorSha256);
    if (signal?.aborted) throw new PdfOmrError("INTERRUPTED", "pitch shadow cancelled");
    return { source, report };
  } catch (error) {
    if (signal?.aborted || (error instanceof PdfOmrError && error.code === "INTERRUPTED")) {
      throw new PdfOmrError("INTERRUPTED", "pitch shadow cancelled");
    }
    // Optional source analysis must not turn an otherwise successful recognition into a failure.
    return {
      report: {
        schemaVersion: "1.0.0",
        policy: "legato-source-pitch-shadow-v2",
        mode: "shadow",
        writebackReady: false,
        inputSha256: draft.provenance?.inputSha256,
        draftSha256: sha256Bytes(new TextEncoder().encode(canonicalJson(draft))),
        extractorSha256,
        reason: "extractor-unavailable",
        failureStage,
        suggestions: [],
        decisions: [],
      },
    };
  } finally {
    if (runtimeDirectory !== undefined) {
      // Cleanup failure must not replace cancellation or a valid fallback result.
      await rm(runtimeDirectory, { recursive: true, force: true }).catch(() => {});
    }
  }
}
