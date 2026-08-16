import { z } from "zod";
import { canonicalJson, sha256Bytes } from "../canonical-json";
import { PdfOmrError } from "../errors";
import { omrScoreDraftSchema, sha256Schema, type OmrScoreDraft } from "../schemas";

const measureDisagreementKindSchema = z.enum([
  "measure-missing-in-primary",
  "measure-missing-in-secondary",
  "measure-content-disagreement",
]);

export const engineComparisonProposalSchema = z
  .object({
    kind: measureDisagreementKindSchema,
    primaryMeasureIndex: z.number().int().nonnegative().nullable(),
    secondaryMeasureIndex: z.number().int().nonnegative().nullable(),
    primaryFingerprint: sha256Schema.optional(),
    secondaryFingerprint: sha256Schema.optional(),
    autoApplicable: z.literal(false),
  })
  .strict();

export const engineDraftComparisonSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    agreement: z.boolean(),
    alignmentAmbiguous: z.boolean(),
    primaryMeasureCount: z.number().int().nonnegative(),
    secondaryMeasureCount: z.number().int().nonnegative(),
    alignedMeasureCount: z.number().int().nonnegative(),
    proposals: z.array(engineComparisonProposalSchema),
  })
  .strict();

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
        total: z.number().int().nonnegative(),
        agreements: z.number().int().nonnegative(),
        disagreements: z.number().int().nonnegative(),
        ambiguousAlignments: z.number().int().nonnegative(),
      })
      .strict(),
    comparisons: z.array(engineDraftComparisonSchema.extend({ itemId: z.string().min(1) }).strict()),
  })
  .strict();

export type EngineComparisonReport = z.infer<typeof engineComparisonReportSchema>;

type MeasureSlice = {
  index: number;
  fingerprint: string;
};

type AlignmentStep =
  | { kind: "match" | "substitute"; primary: MeasureSlice; secondary: MeasureSlice }
  | { kind: "delete"; primary: MeasureSlice }
  | { kind: "insert"; secondary: MeasureSlice };

export function compareEngineDrafts(primaryInput: OmrScoreDraft, secondaryInput: OmrScoreDraft): EngineDraftComparison {
  const primary = omrScoreDraftSchema.parse(primaryInput);
  const secondary = omrScoreDraftSchema.parse(secondaryInput);
  requireCompatibleTopology(primary, secondary);
  const primaryMeasures = projectMeasureSlices(primary);
  const secondaryMeasures = projectMeasureSlices(secondary);
  const alignment = alignMeasures(primaryMeasures, secondaryMeasures);
  const proposals: EngineDraftComparison["proposals"] = [];
  for (const step of alignment.steps) {
    if (step.kind === "match") continue;
    if (step.kind === "substitute") {
      proposals.push({
        kind: "measure-content-disagreement",
        primaryMeasureIndex: step.primary.index,
        secondaryMeasureIndex: step.secondary.index,
        primaryFingerprint: step.primary.fingerprint,
        secondaryFingerprint: step.secondary.fingerprint,
        autoApplicable: false,
      });
      continue;
    }
    if (step.kind === "delete") {
      proposals.push({
        kind: "measure-missing-in-secondary",
        primaryMeasureIndex: step.primary.index,
        secondaryMeasureIndex: null,
        primaryFingerprint: step.primary.fingerprint,
        autoApplicable: false,
      });
      continue;
    }
    proposals.push({
      kind: "measure-missing-in-primary",
      primaryMeasureIndex: null,
      secondaryMeasureIndex: step.secondary.index,
      secondaryFingerprint: step.secondary.fingerprint,
      autoApplicable: false,
    });
  }
  return engineDraftComparisonSchema.parse({
    schemaVersion: "1.0.0",
    agreement: proposals.length === 0,
    alignmentAmbiguous: alignment.ambiguous,
    primaryMeasureCount: primaryMeasures.length,
    secondaryMeasureCount: secondaryMeasures.length,
    alignedMeasureCount: alignment.steps.filter((step) => step.kind === "match" || step.kind === "substitute").length,
    proposals,
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
    const bytes = new TextEncoder().encode(canonicalJson(facts));
    return { index, fingerprint: sha256Bytes(bytes) };
  });
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
