import { randomUUID } from "node:crypto";
import { access, readFile, rename, rm } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { createArtifactWriter, verifyArtifactHash } from "../artifact-writer";
import { canonicalJson, sha256Bytes } from "../canonical-json";
import { PdfOmrError } from "../errors";
import { applyReviewedPatches } from "../fusion/apply-reviewed-patches";
import { fusionInputReportSchema, fusionRunManifestSchema, repairProposalsSchema } from "../fusion/schemas";
import { validateWriteback } from "../fusion/validate-writeback";
import {
  applyFusionReportSchema,
  applyFusionRunManifestSchema,
  fusionDecisionSetSchema,
  type ApplyFusionReport,
} from "../fusion/writeback-schemas";

type ApplyFusionOptions = {
  run: string;
  decisions: string;
  output: string;
  cwd: string;
};

export async function applyFusionCommand(options: ApplyFusionOptions): Promise<ApplyFusionReport> {
  const runDirectory = resolve(options.cwd, options.run);
  const outputDirectory = resolve(options.cwd, options.output);
  await ensureOutputAbsent(outputDirectory);
  const startedAt = new Date().toISOString();

  const runBytes = await readRequiredFile(resolve(runDirectory, "run.json"), "fusion-run-integrity-failed");
  const inputBytes = await readRequiredFile(resolve(runDirectory, "input.json"), "fusion-run-integrity-failed");
  const proposalBytes = await readRequiredFile(
    resolve(runDirectory, "repair-proposals.json"),
    "fusion-run-integrity-failed",
  );
  const decisionBytes = await readRequiredFile(resolve(options.cwd, options.decisions), "invalid-decisions");

  const sourceRun = parseOrFail(
    () => fusionRunManifestSchema.parse(JSON.parse(decode(runBytes))),
    "fusion-run-integrity-failed",
  );
  const input = parseOrFail(
    () => fusionInputReportSchema.parse(JSON.parse(decode(inputBytes))),
    "fusion-run-integrity-failed",
  );
  const proposals = parseOrFail(
    () => repairProposalsSchema.parse(JSON.parse(decode(proposalBytes))),
    "fusion-run-integrity-failed",
  );
  const decisions = parseOrFail(
    () => fusionDecisionSetSchema.parse(JSON.parse(decode(decisionBytes))),
    "invalid-decisions",
  );

  await verifyFusionRunArtifacts(runDirectory, sourceRun.artifactSha256);
  const runSha256 = sha256Bytes(runBytes);
  const proposalSha256 = sha256Bytes(proposalBytes);
  if (sourceRun.compatibilityStatus !== "compatible") fail("fusion-run-not-compatible");
  if (sourceRun.runId !== decisions.fusionRun.runId || runSha256 !== decisions.fusionRun.runManifestSha256) {
    fail("decision-run-mismatch");
  }
  if (
    proposalSha256 !== decisions.fusionRun.repairProposalsSha256 ||
    sourceRun.artifactSha256["repair-proposals.json"] !== proposalSha256
  ) {
    fail("decision-proposal-mismatch");
  }
  if (sourceRun.inputSha256.score !== input.score.sha256 || sourceRun.inputSha256.midi !== input.midi.sha256) {
    fail("fusion-run-integrity-failed");
  }

  const scorePath = resolveRunArtifact(runDirectory, input.score.artifactPath);
  const midiPath = resolveRunArtifact(runDirectory, input.midi.artifactPath);
  const scoreBytes = await readRequiredFile(scorePath, "fusion-run-integrity-failed");
  const midiBytes = await readRequiredFile(midiPath, "fusion-run-integrity-failed");
  if (sha256Bytes(scoreBytes) !== input.score.sha256 || sha256Bytes(midiBytes) !== input.midi.sha256) {
    fail("fusion-run-integrity-failed");
  }

  const applied = applyReviewedPatches(scoreBytes, proposals, decisions);
  const validation = await validateWriteback(scoreBytes, applied.correctedBytes, midiBytes, applied.patchPlan);
  const decisionSha256 = sha256Bytes(new TextEncoder().encode(canonicalJson(decisions)));
  const correctedScoreSha256 = sha256Bytes(applied.correctedBytes);
  const correctedScoreArtifactPath = `corrected/score${scoreExtension(input.score.fileName)}`;
  const temporaryDirectory = resolve(dirname(outputDirectory), `.${basename(outputDirectory)}.${randomUUID()}.tmp`);

  try {
    const writer = await createArtifactWriter(temporaryDirectory);
    await writer.writeBytes("input/fusion-run.json", runBytes);
    await writer.writeJson("input/decisions.json", decisions);
    await writer.writeJson("patch-plan.json", applied.patchPlan);
    await writer.writeBytes(correctedScoreArtifactPath, applied.correctedBytes);
    await writer.writeJson("validation/source.json", {
      blockingDiagnostics: validation.diagnostics.sourceBlocking,
    });
    await writer.writeJson("validation/corrected.json", {
      runtime: validation.runtime,
      blockingDiagnostics: validation.diagnostics.correctedBlocking,
    });
    await writer.writeJson("validation/structural-diff.json", validation.structural);
    await writer.writeJson("validation/fusion-before.json", validation.fusion.before);
    await writer.writeJson("validation/fusion-after.json", validation.fusion.after);
    await writer.writeJson("diagnostics.json", []);
    const runId = `${sha256Bytes(new TextEncoder().encode(`${sourceRun.runId}:${decisionSha256}`)).slice(0, 16)}-writeback`;
    const manifest = applyFusionRunManifestSchema.parse({
      schemaVersion: "1.0.0",
      runId,
      command: "apply-fusion",
      sourceFusion: {
        runId: sourceRun.runId,
        runManifestSha256: runSha256,
        repairProposalsSha256: proposalSha256,
      },
      inputSha256: { score: input.score.sha256, midi: input.midi.sha256, decisions: decisionSha256 },
      correctedScore: { artifactPath: correctedScoreArtifactPath, sha256: correctedScoreSha256 },
      startedAt,
      completedAt: new Date().toISOString(),
      status: "succeeded",
      artifactSha256: writer.artifactSha256(),
    });
    await writer.writeJson("run.json", manifest);
    await rename(temporaryDirectory, outputDirectory);
    return applyFusionReportSchema.parse({
      schemaVersion: "1.0.0",
      command: "apply-fusion",
      status: "succeeded",
      runId,
      appliedCount: applied.patchPlan.entries.filter((entry) => entry.decision === "applied").length,
      correctedScoreArtifactPath,
      correctedScoreSha256,
    });
  } catch (error) {
    await rm(temporaryDirectory, { recursive: true, force: true });
    throw error;
  }
}

async function verifyFusionRunArtifacts(runDirectory: string, hashes: Readonly<Record<string, string>>): Promise<void> {
  try {
    for (const [artifactPath, expectedSha256] of Object.entries(hashes)) {
      if (!(await verifyArtifactHash(resolveRunArtifact(runDirectory, artifactPath), expectedSha256))) {
        fail("fusion-run-integrity-failed");
      }
    }
  } catch (error) {
    if (error instanceof PdfOmrError) throw error;
    fail("fusion-run-integrity-failed", error);
  }
}

function resolveRunArtifact(runDirectory: string, artifactPath: string): string {
  if (artifactPath.length === 0 || isAbsolute(artifactPath)) fail("fusion-run-integrity-failed");
  const target = resolve(runDirectory, artifactPath);
  const fromRoot = relative(runDirectory, target);
  if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
    fail("fusion-run-integrity-failed");
  }
  return target;
}

async function ensureOutputAbsent(outputDirectory: string): Promise<void> {
  try {
    await access(outputDirectory);
    fail("output-directory-exists");
  } catch (error) {
    if (error instanceof PdfOmrError) throw error;
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

async function readRequiredFile(path: string, reason: string): Promise<Uint8Array> {
  try {
    return await readFile(path);
  } catch (error) {
    fail(reason, error);
  }
}

function parseOrFail<T>(parse: () => T, reason: string): T {
  try {
    return parse();
  } catch (error) {
    fail(reason, error);
  }
}

function decode(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function scoreExtension(fileName: string): string {
  const extension = extname(fileName).toLowerCase();
  return extension === ".mxl" || extension === ".xml" || extension === ".musicxml" ? extension : ".musicxml";
}

function fail(reason: string, cause?: unknown): never {
  throw new PdfOmrError("INVALID_INPUT", "fusion writeback input is invalid", {
    context: { reason },
    ...(cause === undefined ? {} : { cause }),
  });
}
