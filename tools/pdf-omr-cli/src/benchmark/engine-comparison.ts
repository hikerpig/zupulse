import { z } from "zod";
import { canonicalJson, sha256Bytes } from "../canonical-json";
import { PdfOmrError } from "../errors";
import { omrScoreDraftSchema, sha256Schema, type OmrScoreDraft } from "../schemas";

const measureDisagreementKindSchema = z.enum([
  "measure-missing-in-primary",
  "measure-missing-in-secondary",
  "measure-content-disagreement",
]);

const candidateEventSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("note"),
      onset: z.object({ numerator: z.number().int(), denominator: z.number().int().positive() }).strict(),
      duration: z.object({ numerator: z.number().int(), denominator: z.number().int().positive() }).strict(),
      writtenPitch: z
        .object({
          step: z.enum(["A", "B", "C", "D", "E", "F", "G"]),
          alter: z.number().int().min(-2).max(2),
          octave: z.number().int().min(-1).max(9),
        })
        .strict()
        .optional(),
      soundingMidi: z.number().int().min(0).max(127).optional(),
      tie: z.enum(["start", "continue", "end"]).optional(),
      tuplet: z
        .object({ actualNotes: z.number().int().positive(), normalNotes: z.number().int().positive() })
        .strict()
        .optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("rest"),
      onset: z.object({ numerator: z.number().int(), denominator: z.number().int().positive() }).strict(),
      duration: z.object({ numerator: z.number().int(), denominator: z.number().int().positive() }).strict(),
    })
    .strict(),
]);

const candidateMeasureSchema = z
  .object({
    staves: z
      .array(
        z
          .object({
            staffIndex: z.number().int().nonnegative(),
            timeSignature: z
              .object({ numerator: z.number().int().positive(), denominator: z.number().int().positive() })
              .strict()
              .optional(),
            duration: z
              .object({ numerator: z.number().int(), denominator: z.number().int().positive() })
              .strict()
              .optional(),
            keySignature: z
              .object({ fifths: z.number().int().min(-7).max(7) })
              .strict()
              .optional(),
            clef: z
              .object({
                sign: z.enum(["G", "F", "C", "percussion", "TAB", "none"]),
                line: z.number().int().positive().optional(),
              })
              .strict()
              .optional(),
            repeat: z.object({ forward: z.boolean(), backward: z.boolean() }).strict().optional(),
            voices: z.array(
              z
                .object({
                  index: z.number().int().positive(),
                  events: z.array(candidateEventSchema),
                })
                .strict(),
            ),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

const repairCandidateCommon = {
  targetMeasureIndex: z.number().int().nonnegative(),
  candidateSha256: sha256Schema,
  reviewRequired: z.literal(true),
  autoApplicable: z.literal(false),
};

export const engineRepairCandidateSchema = z
  .discriminatedUnion("operation", [
    z
      .object({
        operation: z.literal("insert"),
        ...repairCandidateCommon,
        sourceMeasureIndex: z.number().int().nonnegative(),
        sourceFingerprint: sha256Schema,
        measure: candidateMeasureSchema,
      })
      .strict(),
    z
      .object({
        operation: z.literal("replace"),
        ...repairCandidateCommon,
        sourceMeasureIndex: z.number().int().nonnegative(),
        sourceFingerprint: sha256Schema,
        targetFingerprint: sha256Schema,
        measure: candidateMeasureSchema,
      })
      .strict(),
    z
      .object({
        operation: z.literal("delete"),
        ...repairCandidateCommon,
        targetFingerprint: sha256Schema,
      })
      .strict(),
  ])
  .superRefine((candidate, context) => {
    const { candidateSha256, ...facts } = candidate;
    if (candidateSha256 === hashCanonical(facts)) return;
    context.addIssue({
      code: "custom",
      path: ["candidateSha256"],
      message: "repair candidate hash does not match its musical facts",
    });
  });

export const engineComparisonProposalSchema = z
  .object({
    kind: measureDisagreementKindSchema,
    primaryMeasureIndex: z.number().int().nonnegative().nullable(),
    secondaryMeasureIndex: z.number().int().nonnegative().nullable(),
    primaryFingerprint: sha256Schema.optional(),
    secondaryFingerprint: sha256Schema.optional(),
    repairCandidate: engineRepairCandidateSchema.optional(),
    autoApplicable: z.literal(false),
  })
  .strict();

const engineDraftComparisonFields = {
  schemaVersion: z.literal("1.0.0"),
  topologyMode: z.enum(["strict", "ordered-staves"]).default("strict"),
  agreement: z.boolean(),
  alignmentAmbiguous: z.boolean(),
  primaryMeasureCount: z.number().int().nonnegative(),
  secondaryMeasureCount: z.number().int().nonnegative(),
  alignedMeasureCount: z.number().int().nonnegative(),
  proposals: z.array(engineComparisonProposalSchema),
};

const engineDraftComparisonObjectSchema = z.object(engineDraftComparisonFields).strict();

export const engineDraftComparisonSchema = engineDraftComparisonObjectSchema.superRefine(validateRepairCandidates);

export type EngineDraftComparison = z.infer<typeof engineDraftComparisonSchema>;

const benchmarkRunReferenceSchema = z
  .object({
    engineId: z.string().min(1),
    preprocess: z.string().min(1),
    reportSha256: sha256Schema,
  })
  .strict();

export const engineComparisonReportSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    command: z.literal("compare-engines"),
    identity: z
      .object({
        corpusId: z.string().min(1),
        protocolVersion: z.string().min(1),
        manifestSha256: sha256Schema,
        mode: z.literal("development"),
      })
      .strict(),
    primary: benchmarkRunReferenceSchema,
    secondary: benchmarkRunReferenceSchema,
    items: z
      .object({
        attempted: z.number().int().nonnegative(),
        primarySucceeded: z.number().int().nonnegative(),
        secondarySucceeded: z.number().int().nonnegative(),
        comparable: z.number().int().nonnegative(),
        agreements: z.number().int().nonnegative(),
        disagreements: z.number().int().nonnegative(),
        ambiguousAlignments: z.number().int().nonnegative(),
        repairCandidates: z.number().int().nonnegative(),
      })
      .strict(),
    comparisons: z.array(
      z
        .object({ itemId: z.string().min(1), ...engineDraftComparisonFields })
        .strict()
        .superRefine(validateRepairCandidates),
    ),
  })
  .strict();

export type EngineComparisonReport = z.infer<typeof engineComparisonReportSchema>;

function validateRepairCandidates(
  comparison: z.infer<typeof engineDraftComparisonObjectSchema>,
  context: z.RefinementCtx,
): void {
  comparison.proposals.forEach((proposal, index) => {
    const candidate = proposal.repairCandidate;
    if (candidate === undefined) return;
    if (comparison.alignmentAmbiguous) {
      context.addIssue({
        code: "custom",
        path: ["proposals", index, "repairCandidate"],
        message: "ambiguous alignment cannot carry a repair candidate",
      });
    }
    const expectedOperation =
      proposal.kind === "measure-missing-in-primary"
        ? "insert"
        : proposal.kind === "measure-missing-in-secondary"
          ? "delete"
          : "replace";
    if (candidate.operation !== expectedOperation) {
      context.addIssue({
        code: "custom",
        path: ["proposals", index, "repairCandidate", "operation"],
        message: "repair operation does not match disagreement kind",
      });
    }
  });
}

type MeasureSlice = {
  index: number;
  fingerprint: string;
  candidateMeasure: z.infer<typeof candidateMeasureSchema>;
};

type AlignmentStep =
  | { kind: "match" | "substitute"; primary: MeasureSlice; secondary: MeasureSlice }
  | { kind: "delete"; primary: MeasureSlice }
  | { kind: "insert"; secondary: MeasureSlice };

export function compareEngineDrafts(
  primaryInput: OmrScoreDraft,
  secondaryInput: OmrScoreDraft,
  options: { topologyMode?: "strict" | "ordered-staves" } = {},
): EngineDraftComparison {
  const topologyMode = options.topologyMode ?? "strict";
  const primary = createComparisonView(primaryInput, topologyMode);
  const secondary = createComparisonView(secondaryInput, topologyMode);
  requireCompatibleTopology(primary, secondary);
  const primaryMeasures = projectMeasureSlices(primary);
  const secondaryMeasures = projectMeasureSlices(secondary);
  const alignment = alignMeasures(primaryMeasures, secondaryMeasures);
  const proposals: EngineDraftComparison["proposals"] = [];
  let primaryCursor = 0;
  for (const step of alignment.steps) {
    if (step.kind === "match") {
      primaryCursor += 1;
      continue;
    }
    if (step.kind === "substitute") {
      proposals.push({
        kind: "measure-content-disagreement",
        primaryMeasureIndex: step.primary.index,
        secondaryMeasureIndex: step.secondary.index,
        primaryFingerprint: step.primary.fingerprint,
        secondaryFingerprint: step.secondary.fingerprint,
        ...(alignment.ambiguous
          ? {}
          : {
              repairCandidate: createContentCandidate({
                operation: "replace",
                targetMeasureIndex: step.primary.index,
                targetFingerprint: step.primary.fingerprint,
                source: step.secondary,
              }),
            }),
        autoApplicable: false,
      });
      primaryCursor += 1;
      continue;
    }
    if (step.kind === "delete") {
      proposals.push({
        kind: "measure-missing-in-secondary",
        primaryMeasureIndex: step.primary.index,
        secondaryMeasureIndex: null,
        primaryFingerprint: step.primary.fingerprint,
        ...(alignment.ambiguous
          ? {}
          : {
              repairCandidate: createDeleteCandidate(step.primary),
            }),
        autoApplicable: false,
      });
      primaryCursor += 1;
      continue;
    }
    proposals.push({
      kind: "measure-missing-in-primary",
      primaryMeasureIndex: null,
      secondaryMeasureIndex: step.secondary.index,
      secondaryFingerprint: step.secondary.fingerprint,
      ...(alignment.ambiguous
        ? {}
        : {
            repairCandidate: createContentCandidate({
              operation: "insert",
              targetMeasureIndex: primaryCursor,
              source: step.secondary,
            }),
          }),
      autoApplicable: false,
    });
  }
  return engineDraftComparisonSchema.parse({
    schemaVersion: "1.0.0",
    topologyMode,
    agreement: proposals.length === 0,
    alignmentAmbiguous: alignment.ambiguous,
    primaryMeasureCount: primaryMeasures.length,
    secondaryMeasureCount: secondaryMeasures.length,
    alignedMeasureCount: alignment.steps.filter((step) => step.kind === "match" || step.kind === "substitute").length,
    proposals,
  });
}

export function fingerprintDraftMeasures(
  input: OmrScoreDraft,
  topologyMode: "strict" | "ordered-staves" = "strict",
): string[] {
  const draft = createComparisonView(input, topologyMode);
  if (draft.parts.length !== 1) {
    throw new PdfOmrError("BENCHMARK_EVALUATION_LIMITATION", "cross-engine part identity is unavailable", {
      context: { reason: "cross-engine-part-identity-unavailable" },
    });
  }
  return projectMeasureSlices(draft).map((measure) => measure.fingerprint);
}

export function createComparisonView(input: OmrScoreDraft, topologyMode: "strict" | "ordered-staves"): OmrScoreDraft {
  const draft = omrScoreDraftSchema.parse(input);
  if (topologyMode === "strict") return draft;
  const staves = draft.parts.flatMap((part) => part.staves).map((staff, index) => ({ ...staff, index }));
  return omrScoreDraftSchema.parse({
    schemaVersion: "1.0.0",
    ...(draft.provenance === undefined ? {} : { provenance: draft.provenance }),
    parts: [{ id: "ordered-staves", name: "Ordered staves", staves }],
    diagnostics: draft.diagnostics,
  });
}

function requireCompatibleTopology(primary: OmrScoreDraft, secondary: OmrScoreDraft): void {
  if (primary.parts.length !== 1 || secondary.parts.length !== 1) {
    throw new PdfOmrError("BENCHMARK_EVALUATION_LIMITATION", "cross-engine part identity is unavailable", {
      context: { reason: "cross-engine-part-identity-unavailable" },
    });
  }
  const topology = (draft: OmrScoreDraft) => draft.parts.map((part) => part.staves.map((staff) => staff.index));
  if (canonicalJson(topology(primary)) === canonicalJson(topology(secondary))) return;
  throw new PdfOmrError("BENCHMARK_EVALUATION_LIMITATION", "engine Draft topology is incompatible", {
    context: { reason: "incompatible-engine-topology" },
  });
}

function projectMeasureSlices(draft: OmrScoreDraft): MeasureSlice[] {
  const measureCount = Math.max(...draft.parts.flatMap((part) => part.staves.map((staff) => staff.measures.length)));
  return Array.from({ length: measureCount }, (_, index) => {
    const facts = draft.parts.map((part) =>
      part.staves.map((staff) => {
        const measure = staff.measures[index];
        if (measure === undefined) return null;
        return {
          ...(measure.timeSignature === undefined ? {} : { timeSignature: measure.timeSignature }),
          ...(measure.duration === undefined ? {} : { duration: measure.duration }),
          ...(measure.keySignature === undefined ? {} : { keySignature: measure.keySignature }),
          ...(measure.clef === undefined ? {} : { clef: measure.clef }),
          ...(measure.repeat === undefined ? {} : { repeat: measure.repeat }),
          voices: [...measure.voices]
            .sort((left, right) => left.index - right.index)
            .map((voice) => ({
              index: voice.index,
              events: voice.events.map(projectEvent).sort((left, right) => compareCanonical(left, right)),
            })),
        };
      }),
    );
    const candidateMeasure = candidateMeasureSchema.parse({
      staves: draft.parts[0]!.staves.map((staff) => {
        const measure = staff.measures[index];
        if (measure === undefined) {
          return { staffIndex: staff.index, voices: [] };
        }
        return {
          staffIndex: staff.index,
          ...(measure.timeSignature === undefined ? {} : { timeSignature: measure.timeSignature }),
          ...(measure.duration === undefined ? {} : { duration: measure.duration }),
          ...(measure.keySignature === undefined ? {} : { keySignature: measure.keySignature }),
          ...(measure.clef === undefined ? {} : { clef: measure.clef }),
          ...(measure.repeat === undefined ? {} : { repeat: measure.repeat }),
          voices: [...measure.voices]
            .sort((left, right) => left.index - right.index)
            .map((voice) => ({
              index: voice.index,
              events: voice.events.map(projectEvent).sort((left, right) => compareCanonical(left, right)),
            })),
        };
      }),
    });
    const bytes = new TextEncoder().encode(canonicalJson(facts));
    return { index, fingerprint: sha256Bytes(bytes), candidateMeasure };
  });
}

function createContentCandidate(input: {
  operation: "insert" | "replace";
  targetMeasureIndex: number;
  targetFingerprint?: string;
  source: MeasureSlice;
}): z.infer<typeof engineRepairCandidateSchema> {
  const facts = {
    operation: input.operation,
    targetMeasureIndex: input.targetMeasureIndex,
    sourceMeasureIndex: input.source.index,
    sourceFingerprint: input.source.fingerprint,
    ...(input.targetFingerprint === undefined ? {} : { targetFingerprint: input.targetFingerprint }),
    measure: input.source.candidateMeasure,
    reviewRequired: true as const,
    autoApplicable: false as const,
  };
  return engineRepairCandidateSchema.parse({
    ...facts,
    candidateSha256: hashCanonical(facts),
  });
}

function createDeleteCandidate(target: MeasureSlice): z.infer<typeof engineRepairCandidateSchema> {
  const facts = {
    operation: "delete" as const,
    targetMeasureIndex: target.index,
    targetFingerprint: target.fingerprint,
    reviewRequired: true as const,
    autoApplicable: false as const,
  };
  return engineRepairCandidateSchema.parse({
    ...facts,
    candidateSha256: hashCanonical(facts),
  });
}

function hashCanonical(value: unknown): string {
  return sha256Bytes(new TextEncoder().encode(canonicalJson(value)));
}

function compareCanonical(left: unknown, right: unknown): number {
  const leftJson = canonicalJson(left);
  const rightJson = canonicalJson(right);
  return leftJson < rightJson ? -1 : leftJson > rightJson ? 1 : 0;
}

function projectEvent(
  event: OmrScoreDraft["parts"][number]["staves"][number]["measures"][number]["voices"][number]["events"][number],
) {
  return {
    type: event.type,
    onset: event.onset,
    duration: event.duration,
    ...(event.type === "rest"
      ? {}
      : {
          ...(event.writtenPitch === undefined ? {} : { writtenPitch: event.writtenPitch }),
          ...(event.soundingMidi === undefined ? {} : { soundingMidi: event.soundingMidi }),
          ...(event.tie === undefined ? {} : { tie: event.tie }),
          ...(event.tuplet === undefined ? {} : { tuplet: event.tuplet }),
        }),
  };
}

function alignMeasures(
  primary: readonly MeasureSlice[],
  secondary: readonly MeasureSlice[],
): { steps: AlignmentStep[]; ambiguous: boolean } {
  const costs = Array.from({ length: primary.length + 1 }, () => Array<number>(secondary.length + 1).fill(0));
  const ways = Array.from({ length: primary.length + 1 }, () => Array<number>(secondary.length + 1).fill(0));
  ways[0]![0] = 1;
  for (let primaryCount = 1; primaryCount <= primary.length; primaryCount += 1) {
    costs[primaryCount]![0] = primaryCount;
    ways[primaryCount]![0] = 1;
  }
  for (let secondaryCount = 1; secondaryCount <= secondary.length; secondaryCount += 1) {
    costs[0]![secondaryCount] = secondaryCount;
    ways[0]![secondaryCount] = 1;
  }
  for (let primaryCount = 1; primaryCount <= primary.length; primaryCount += 1) {
    for (let secondaryCount = 1; secondaryCount <= secondary.length; secondaryCount += 1) {
      const equal = primary[primaryCount - 1]!.fingerprint === secondary[secondaryCount - 1]!.fingerprint;
      const candidates = [
        {
          cost: costs[primaryCount - 1]![secondaryCount - 1]! + (equal ? 0 : 1),
          ways: ways[primaryCount - 1]![secondaryCount - 1]!,
        },
        { cost: costs[primaryCount - 1]![secondaryCount]! + 1, ways: ways[primaryCount - 1]![secondaryCount]! },
        { cost: costs[primaryCount]![secondaryCount - 1]! + 1, ways: ways[primaryCount]![secondaryCount - 1]! },
      ];
      const minimum = Math.min(...candidates.map((candidate) => candidate.cost));
      costs[primaryCount]![secondaryCount] = minimum;
      ways[primaryCount]![secondaryCount] = Math.min(
        2,
        candidates
          .filter((candidate) => candidate.cost === minimum)
          .reduce((sum, candidate) => sum + candidate.ways, 0),
      );
    }
  }

  const reversed: AlignmentStep[] = [];
  let primaryCount = primary.length;
  let secondaryCount = secondary.length;
  while (primaryCount > 0 || secondaryCount > 0) {
    const primaryMeasure = primary[primaryCount - 1];
    const secondaryMeasure = secondary[secondaryCount - 1];
    if (
      primaryMeasure !== undefined &&
      secondaryMeasure !== undefined &&
      primaryMeasure.fingerprint === secondaryMeasure.fingerprint &&
      costs[primaryCount]![secondaryCount] === costs[primaryCount - 1]![secondaryCount - 1]
    ) {
      reversed.push({ kind: "match", primary: primaryMeasure, secondary: secondaryMeasure });
      primaryCount -= 1;
      secondaryCount -= 1;
      continue;
    }
    if (
      primaryMeasure !== undefined &&
      secondaryMeasure !== undefined &&
      costs[primaryCount]![secondaryCount] === costs[primaryCount - 1]![secondaryCount - 1]! + 1
    ) {
      reversed.push({ kind: "substitute", primary: primaryMeasure, secondary: secondaryMeasure });
      primaryCount -= 1;
      secondaryCount -= 1;
      continue;
    }
    if (
      primaryMeasure !== undefined &&
      costs[primaryCount]![secondaryCount] === costs[primaryCount - 1]![secondaryCount]! + 1
    ) {
      reversed.push({ kind: "delete", primary: primaryMeasure });
      primaryCount -= 1;
      continue;
    }
    if (secondaryMeasure === undefined) throw new Error("measure alignment backtracking failed");
    reversed.push({ kind: "insert", secondary: secondaryMeasure });
    secondaryCount -= 1;
  }
  return { steps: reversed.reverse(), ambiguous: ways[primary.length]![secondary.length]! > 1 };
}
