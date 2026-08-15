import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import {
  applyFusionCommand,
  fuseCommand,
  fusionAlignmentSchema,
  fusionRunManifestSchema,
  repairProposalsSchema,
  type ReviewedWrittenPitch,
} from "@zupulse/pdf-omr-cli/midi-correction";
import { PdfOmrError } from "@zupulse/pdf-omr-cli/pipeline";
import type { PdfOmrJobController } from "./pdf-omr-controller";

type CompletedResult = ReturnType<PdfOmrJobController["getCompletedResult"]>;
type Commands = {
  fuse: typeof fuseCommand;
  apply: typeof applyFusionCommand;
};

export type PdfOmrMidiAnalysis = {
  midiFileName: string;
  compatibility: {
    status: "compatible" | "ambiguous" | "incompatible";
    scoreCoverage: number;
    midiCoverage: number;
    pitchAgreement: number;
  };
  proposals: Array<{
    id: string;
    type: "pitch-disagreement" | "midi-supported-missing-note" | "unsupported-score-note";
    confidence: number;
    reviewability: { status: "writeback-ready" | "review-only"; reasons: string[] };
    measureIndex?: number;
    before?: ReviewedWrittenPitch;
    suggestedSoundingMidi?: number;
  }>;
};

export type PdfOmrCorrectedResult = {
  fileName: string;
  path: string;
  outputSha256: string;
  appliedCount: number;
};

export class PdfOmrMidiCorrectionController {
  private readonly analyses = new Map<string, { runDirectory: string; analysis: PdfOmrMidiAnalysis }>();
  private readonly corrected = new Map<string, PdfOmrCorrectedResult>();

  constructor(
    private readonly jobs: { getCompletedResult(jobId: string): CompletedResult },
    private readonly commands: Commands = { fuse: fuseCommand, apply: applyFusionCommand },
  ) {}

  async analyze(input: {
    jobId: string;
    midiPath: string;
    midiFileName: string;
    outputDirectory: string;
  }): Promise<PdfOmrMidiAnalysis> {
    const completed = this.requireCompleted(input.jobId);
    await mkdir(dirname(input.outputDirectory), { recursive: true });
    await this.commands.fuse({
      musicXml: join(completed.outputDirectory, completed.result.artifacts.musicXml),
      midi: input.midiPath,
      output: input.outputDirectory,
      midiKind: "score-export",
      repairMode: "report-only",
      cwd: ".",
    });
    const [alignmentValue, proposalsValue] = await Promise.all([
      readJson(join(input.outputDirectory, "alignment.json")),
      readJson(join(input.outputDirectory, "repair-proposals.json")),
    ]);
    const alignment = fusionAlignmentSchema.parse(alignmentValue);
    const proposals = repairProposalsSchema.parse(proposalsValue);
    const analysis: PdfOmrMidiAnalysis = {
      midiFileName: basename(input.midiFileName),
      compatibility: {
        status: alignment.compatibility.status,
        scoreCoverage: alignment.summary.scoreCoverage,
        midiCoverage: alignment.summary.midiCoverage,
        pitchAgreement: alignment.summary.pitchAgreement,
      },
      proposals: proposals.proposals.map((proposal) => ({
        id: proposal.id,
        type: proposal.type,
        confidence: proposal.confidence,
        reviewability: {
          status: proposal.reviewability.status,
          reasons: [...proposal.reviewability.reasons],
        },
        ...(proposal.target === undefined ? {} : { measureIndex: proposal.target.measureIndex }),
        ...(proposal.before === undefined ? {} : { before: proposal.before.writtenPitch }),
        ...(proposal.suggestedSoundingMidi === undefined
          ? {}
          : { suggestedSoundingMidi: proposal.suggestedSoundingMidi }),
      })),
    };
    this.analyses.set(input.jobId, { runDirectory: input.outputDirectory, analysis });
    this.corrected.delete(input.jobId);
    return analysis;
  }

  async apply(input: {
    jobId: string;
    decisions: Array<{ proposalId: string; writtenPitch: ReviewedWrittenPitch }>;
    outputDirectory: string;
  }): Promise<{ appliedCount: number }> {
    this.requireCompleted(input.jobId);
    const context = this.analyses.get(input.jobId);
    if (context === undefined) fail("midi-analysis-required");
    const runPath = join(context.runDirectory, "run.json");
    const proposalPath = join(context.runDirectory, "repair-proposals.json");
    const [runBytes, proposalBytes] = await Promise.all([readFile(runPath), readFile(proposalPath)]);
    const run = fusionRunManifestSchema.parse(JSON.parse(runBytes.toString("utf8")));
    const decisionsPath = `${input.outputDirectory}.decisions.json`;
    await mkdir(dirname(input.outputDirectory), { recursive: true });
    await writeFile(
      decisionsPath,
      JSON.stringify({
        schemaVersion: "1.0.0",
        fusionRun: {
          runId: run.runId,
          runManifestSha256: sha256(runBytes),
          repairProposalsSha256: sha256(proposalBytes),
        },
        decisions: input.decisions.map((decision) => ({ ...decision, action: "apply" as const })),
      }),
      { flag: "wx", mode: 0o600 },
    );
    try {
      const report = await this.commands.apply({
        run: context.runDirectory,
        decisions: decisionsPath,
        output: input.outputDirectory,
        cwd: ".",
      });
      const extension = extname(report.correctedScoreArtifactPath) || ".musicxml";
      this.corrected.set(input.jobId, {
        fileName: `score-midi-corrected${extension}`,
        path: join(input.outputDirectory, report.correctedScoreArtifactPath),
        outputSha256: report.correctedScoreSha256,
        appliedCount: report.appliedCount,
      });
      return { appliedCount: report.appliedCount };
    } finally {
      await rm(decisionsPath, { force: true });
    }
  }

  getCorrectedResult(jobId: string): PdfOmrCorrectedResult | undefined {
    return this.corrected.get(jobId);
  }

  private requireCompleted(jobId: string): NonNullable<CompletedResult> {
    const completed = this.jobs.getCompletedResult(jobId);
    if (completed === undefined) fail("completed-omr-result-required");
    return completed;
  }
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function fail(reason: string): never {
  throw new PdfOmrError("INVALID_INPUT", "MIDI correction request is invalid", { context: { reason } });
}
