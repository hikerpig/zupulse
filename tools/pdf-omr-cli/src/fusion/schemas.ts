import { z } from "zod";
import { rationalSchema } from "../schemas";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const nonnegativeIntegerSchema = z.number().int().nonnegative();

export const fusionDiagnosticSchema = z
  .object({
    code: z.string().min(1),
    severity: z.enum(["info", "warning", "blocking"]),
    message: z.string().min(1),
    scoreNoteId: z.string().min(1).optional(),
    midiNoteId: z.string().min(1).optional(),
    context: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const scoreNoteEvidenceSchema = z
  .object({
    id: z.string().min(1),
    partId: z.string().min(1),
    staffIndex: nonnegativeIntegerSchema,
    voice: z.number().int().positive(),
    measureIndex: nonnegativeIntegerSchema,
    playbackMeasureIndex: nonnegativeIntegerSchema,
    playbackIteration: nonnegativeIntegerSchema,
    writtenOnset: rationalSchema,
    playbackOnset: rationalSchema,
    duration: rationalSchema,
    soundingMidi: z.number().int().min(0).max(127),
    sourceNoteId: z.string().min(1),
  })
  .strict();

export const scoreEvidenceSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    source: z
      .object({
        fileName: z.string().min(1),
        sha256: sha256Schema,
        sizeBytes: nonnegativeIntegerSchema,
      })
      .strict(),
    writtenMeasureCount: nonnegativeIntegerSchema,
    playbackMeasureOrder: z.array(nonnegativeIntegerSchema),
    notes: z.array(scoreNoteEvidenceSchema),
    diagnostics: z.array(fusionDiagnosticSchema),
  })
  .strict();

export const fusionCompatibilitySchema = z
  .object({
    status: z.enum(["compatible", "ambiguous", "incompatible"]),
    detectedTransposition: z.number().int().min(-12).max(12),
    chromaSimilarity: z.number().finite().min(0).max(1),
    transpositionMargin: z.number().finite().nonnegative(),
    scoreNoteCount: nonnegativeIntegerSchema,
    midiNoteCount: nonnegativeIntegerSchema,
    noteCountRatio: z.number().finite().nonnegative(),
    reasons: z.array(z.string().min(1)),
  })
  .strict();

const alignmentEntrySchema = z
  .object({
    id: z.string().min(1),
    status: z.enum(["matched", "score-only", "midi-only", "ambiguous"]),
    scoreNoteId: z.string().min(1).optional(),
    midiNoteId: z.string().min(1).optional(),
    scorePitch: z.number().int().min(0).max(127).optional(),
    midiPitch: z.number().int().min(0).max(127).optional(),
    onsetDistance: z.number().finite().min(0).max(1).optional(),
    confidence: z.number().finite().min(0).max(1),
    reason: z.string().min(1).optional(),
  })
  .strict();

export const fusionAlignmentSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    algorithm: z
      .object({
        id: z.literal("zupulse-score-midi-frame-alignment"),
        version: z.literal("1.0.0"),
        parameters: z
          .object({
            gapCost: z.number().positive(),
            onsetWeight: z.number().nonnegative(),
            maxReconciliationOnsetDistance: z.number().positive().max(1),
            maxTracebackCells: z.number().int().positive(),
          })
          .strict(),
      })
      .strict(),
    compatibility: fusionCompatibilitySchema,
    entries: z.array(alignmentEntrySchema),
    summary: z
      .object({
        matched: nonnegativeIntegerSchema,
        ambiguous: nonnegativeIntegerSchema,
        scoreOnly: nonnegativeIntegerSchema,
        midiOnly: nonnegativeIntegerSchema,
        scoreCoverage: z.number().finite().min(0).max(1),
        midiCoverage: z.number().finite().min(0).max(1),
        pitchAgreement: z.number().finite().min(0).max(1),
        frameAlignmentCost: z.number().finite().nonnegative(),
      })
      .strict(),
  })
  .strict();

const repairProposalSchema = z
  .object({
    id: z.string().min(1),
    type: z.enum(["pitch-disagreement", "midi-supported-missing-note", "unsupported-score-note"]),
    scoreNoteId: z.string().min(1).optional(),
    midiNoteId: z.string().min(1).optional(),
    suggestedSoundingMidi: z.number().int().min(0).max(127).optional(),
    confidence: z.number().finite().min(0).max(1),
    autoApplicable: z.literal(false),
    reason: z.string().min(1),
  })
  .strict();

export const repairProposalsSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    mode: z.literal("report-only"),
    proposals: z.array(repairProposalSchema),
  })
  .strict();

const fusionSourceInputSchema = z
  .object({
    fileName: z.string().min(1),
    sha256: sha256Schema,
    sizeBytes: nonnegativeIntegerSchema,
    artifactPath: z.string().min(1),
  })
  .strict();

export const fusionInputReportSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    score: fusionSourceInputSchema,
    midi: fusionSourceInputSchema,
    parameters: z
      .object({
        midiKind: z.literal("score-export"),
        repairMode: z.literal("report-only"),
      })
      .strict(),
  })
  .strict();

export const fusionRunManifestSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    runId: z.string().min(1),
    command: z.literal("fuse"),
    inputSha256: z
      .object({
        score: sha256Schema,
        midi: sha256Schema,
      })
      .strict(),
    fusion: z
      .object({
        id: z.literal("zupulse-score-midi-fusion"),
        version: z.literal("1.0.0"),
      })
      .strict(),
    parameters: z
      .object({
        midiKind: z.literal("score-export"),
        repairMode: z.literal("report-only"),
      })
      .strict(),
    startedAt: z.iso.datetime(),
    completedAt: z.iso.datetime(),
    status: z.literal("succeeded"),
    compatibilityStatus: z.enum(["compatible", "ambiguous", "incompatible"]),
    artifactSha256: z.record(z.string().min(1), sha256Schema),
  })
  .strict();

export const fusionReportSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    command: z.literal("fuse"),
    status: z.literal("succeeded"),
    runId: z.string().min(1),
    compatibilityStatus: z.enum(["compatible", "ambiguous", "incompatible"]),
    scoreEvidenceSha256: sha256Schema,
    performanceEvidenceSha256: sha256Schema,
    alignmentSha256: sha256Schema,
    repairProposalsSha256: sha256Schema,
  })
  .strict();

export type FusionDiagnostic = z.infer<typeof fusionDiagnosticSchema>;
export type ScoreNoteEvidence = z.infer<typeof scoreNoteEvidenceSchema>;
export type ScoreEvidence = z.infer<typeof scoreEvidenceSchema>;
export type FusionCompatibility = z.infer<typeof fusionCompatibilitySchema>;
export type FusionAlignment = z.infer<typeof fusionAlignmentSchema>;
export type RepairProposal = z.infer<typeof repairProposalSchema>;
export type RepairProposals = z.infer<typeof repairProposalsSchema>;
export type FusionInputReport = z.infer<typeof fusionInputReportSchema>;
export type FusionRunManifest = z.infer<typeof fusionRunManifestSchema>;
export type FusionReport = z.infer<typeof fusionReportSchema>;
