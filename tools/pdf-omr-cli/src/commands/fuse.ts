import { readFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { createArtifactWriter } from "../artifact-writer";
import { sha256Bytes } from "../canonical-json";
import { PdfOmrError } from "../errors";
import { alignScorePerformance } from "../fusion/align-score-performance";
import { assessFusionCompatibility } from "../fusion/assess-compatibility";
import { buildScoreEvidence } from "../fusion/build-score-evidence";
import { buildWritebackProposals } from "../fusion/build-writeback-proposals";
import {
  fusionInputReportSchema,
  fusionReportSchema,
  fusionRunManifestSchema,
  type FusionDiagnostic,
  type FusionReport,
} from "../fusion/schemas";
import { buildPerformanceEvidence } from "../midi/build-performance-evidence";
import { parseStandardMidi } from "../midi/parse-standard-midi";
import { normalizeAudiverisMusicXmlWithSourceIndex } from "../normalizers/audiveris";

type FuseOptions = {
  musicXml: string;
  midi: string;
  output: string;
  midiKind: "score-export";
  repairMode: "report-only";
  cwd: string;
};

export async function fuseCommand(options: FuseOptions): Promise<FusionReport> {
  const scorePath = resolve(options.cwd, options.musicXml);
  const midiPath = resolve(options.cwd, options.midi);
  const scoreBytes = await readInput(scorePath, "unreadable-musicxml");
  const midiBytes = await readInput(midiPath, "unreadable-midi");
  const scoreSha256 = sha256Bytes(scoreBytes);
  const midiSha256 = sha256Bytes(midiBytes);
  const scoreFileName = basename(options.musicXml);
  const midiFileName = basename(options.midi);
  const scoreArtifactPath = `input/score${scoreExtension(scoreFileName)}`;
  const midiArtifactPath = "input/midi.mid";
  const startedAt = new Date().toISOString();

  const normalization = normalizeAudiverisMusicXmlWithSourceIndex(scoreBytes);
  const draft = normalization.draft;
  const scoreEvidence = buildScoreEvidence(draft, {
    fileName: scoreFileName,
    sha256: scoreSha256,
    sizeBytes: scoreBytes.length,
  });
  const rawMidi = parseStandardMidi(midiBytes);
  const performanceEvidence = buildPerformanceEvidence(rawMidi, {
    fileName: midiFileName,
    sha256: midiSha256,
    sizeBytes: midiBytes.length,
  });
  const compatibility = assessFusionCompatibility(scoreEvidence, performanceEvidence);
  const result = alignScorePerformance(scoreEvidence, performanceEvidence, compatibility);
  const diagnostics: FusionDiagnostic[] = [
    ...scoreEvidence.diagnostics,
    ...performanceEvidence.diagnostics.map((diagnostic) => ({
      code: diagnostic.code,
      severity: diagnostic.severity,
      message: diagnostic.message,
      ...(diagnostic.source === undefined ? {} : { context: { source: diagnostic.source, ...diagnostic.context } }),
      ...(diagnostic.source !== undefined || diagnostic.context === undefined
        ? {}
        : { context: { ...diagnostic.context } }),
    })),
    ...result.diagnostics,
  ];
  const inputReport = fusionInputReportSchema.parse({
    schemaVersion: "1.0.0",
    score: {
      fileName: scoreFileName,
      sha256: scoreSha256,
      sizeBytes: scoreBytes.length,
      artifactPath: scoreArtifactPath,
    },
    midi: {
      fileName: midiFileName,
      sha256: midiSha256,
      sizeBytes: midiBytes.length,
      artifactPath: midiArtifactPath,
    },
    parameters: { midiKind: options.midiKind, repairMode: options.repairMode },
  });
  const proposals = buildWritebackProposals(
    scoreEvidence,
    result.alignment,
    result.repairProposals,
    normalization.sourceNotesByEventId,
  );

  const writer = await createArtifactWriter(resolve(options.cwd, options.output));
  await writer.writeBytes(scoreArtifactPath, scoreBytes);
  await writer.writeBytes(midiArtifactPath, midiBytes);
  await writer.writeJson("input.json", inputReport);
  const scoreEvidenceSha256 = await writer.writeJson("score-evidence.json", scoreEvidence);
  const performanceEvidenceSha256 = await writer.writeJson("performance-evidence.json", performanceEvidence);
  const alignmentSha256 = await writer.writeJson("alignment.json", result.alignment);
  const repairProposalsSha256 = await writer.writeJson("repair-proposals.json", proposals);
  await writer.writeJson("diagnostics.json", diagnostics);
  const runId = sha256Bytes(new TextEncoder().encode(`${scoreSha256}:${midiSha256}`)).slice(0, 16);
  const manifest = fusionRunManifestSchema.parse({
    schemaVersion: "1.0.0",
    runId: `${runId}-fusion`,
    command: "fuse",
    inputSha256: { score: scoreSha256, midi: midiSha256 },
    fusion: { id: "zupulse-score-midi-fusion", version: "1.0.0" },
    parameters: { midiKind: options.midiKind, repairMode: options.repairMode },
    startedAt,
    completedAt: new Date().toISOString(),
    status: "succeeded",
    compatibilityStatus: compatibility.status,
    artifactSha256: writer.artifactSha256(),
  });
  await writer.writeJson("run.json", manifest);

  return fusionReportSchema.parse({
    schemaVersion: "1.0.0",
    command: "fuse",
    status: "succeeded",
    runId: manifest.runId,
    compatibilityStatus: compatibility.status,
    scoreEvidenceSha256,
    performanceEvidenceSha256,
    alignmentSha256,
    repairProposalsSha256,
  });
}

async function readInput(path: string, reason: "unreadable-musicxml" | "unreadable-midi"): Promise<Uint8Array> {
  try {
    return await readFile(path);
  } catch (error) {
    throw new PdfOmrError("INVALID_INPUT", "fusion input cannot be read", {
      context: { reason },
      cause: error,
    });
  }
}

function scoreExtension(fileName: string): string {
  const extension = extname(fileName).toLowerCase();
  return extension === ".mxl" || extension === ".xml" || extension === ".musicxml" ? extension : ".musicxml";
}
