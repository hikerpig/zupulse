import { PdfOmrError } from "../errors";
import { omrScoreDraftSchema, type OmrScoreDraft } from "../schemas";
import { engineDraftComparisonSchema, fingerprintDraftMeasures, type EngineDraftComparison } from "./engine-comparison";
import { alignDraftParts } from "./part-identity";
import { computeSymbolicMetrics, type SymbolicMetrics } from "./symbolic-metrics";

export type RepairCandidateEvaluation = {
  appliedCandidateCount: number;
  before: SymbolicMetrics;
  after: SymbolicMetrics;
};

type RepairCandidate = NonNullable<EngineDraftComparison["proposals"][number]["repairCandidate"]>;
type ContentRepairCandidate = Extract<RepairCandidate, { operation: "insert" | "replace" }>;
type CandidateStaff = ContentRepairCandidate["measure"]["staves"][number];
type DraftMeasure = OmrScoreDraft["parts"][number]["staves"][number]["measures"][number];

export function evaluateRepairCandidates(
  primaryInput: OmrScoreDraft,
  expectedInput: OmrScoreDraft,
  comparisonInput: EngineDraftComparison,
): RepairCandidateEvaluation {
  const primary = omrScoreDraftSchema.parse(primaryInput);
  const expected = omrScoreDraftSchema.parse(expectedInput);
  const comparison = engineDraftComparisonSchema.parse(comparisonInput);
  const simulated = simulateRepairCandidates(primary, comparison);
  return {
    appliedCandidateCount: comparison.proposals.filter((proposal) => proposal.repairCandidate !== undefined).length,
    before: computeSymbolicMetrics(alignDraftParts(primary, expected).draft, expected),
    after: computeSymbolicMetrics(alignDraftParts(simulated, expected).draft, expected),
  };
}

function simulateRepairCandidates(primary: OmrScoreDraft, comparison: EngineDraftComparison): OmrScoreDraft {
  const candidates = comparison.proposals.flatMap((proposal) =>
    proposal.repairCandidate === undefined ? [] : [proposal.repairCandidate],
  );
  const fingerprints = fingerprintDraftMeasures(primary);
  if (fingerprints.length !== comparison.primaryMeasureCount) throw incompatiblePrimary();
  const staves = primary.parts[0]!.staves;
  if (staves.some((staff) => staff.measures.length !== comparison.primaryMeasureCount)) throw incompatiblePrimary();
  const staffIndexes = staves.map((staff) => staff.index);
  for (const candidate of candidates) {
    if (candidate.operation === "insert") {
      if (candidate.targetMeasureIndex > comparison.primaryMeasureCount) throw incompatiblePrimary();
    } else if (fingerprints[candidate.targetMeasureIndex] !== candidate.targetFingerprint) {
      throw incompatiblePrimary();
    }
    if (candidate.operation !== "delete") {
      const candidateStaffIndexes = candidate.measure.staves.map((staff) => staff.staffIndex);
      if (
        candidateStaffIndexes.length !== staffIndexes.length ||
        candidateStaffIndexes.some((staffIndex, index) => staffIndex !== staffIndexes[index])
      ) {
        throw incompatiblePrimary();
      }
    }
  }

  const simulated = structuredClone(primary);
  let offset = 0;
  candidates.forEach((candidate, candidateIndex) => {
    const targetIndex = candidate.targetMeasureIndex + offset;
    for (const staff of simulated.parts[0]!.staves) {
      if (candidate.operation === "delete") {
        staff.measures.splice(targetIndex, 1);
        continue;
      }
      const facts = candidate.measure.staves.find((value) => value.staffIndex === staff.index);
      if (facts === undefined) throw incompatiblePrimary();
      const measure = materializeMeasure(facts, candidate, candidateIndex);
      if (candidate.operation === "insert") staff.measures.splice(targetIndex, 0, measure);
      else staff.measures.splice(targetIndex, 1, measure);
    }
    if (candidate.operation === "insert") offset += 1;
    if (candidate.operation === "delete") offset -= 1;
  });
  for (const staff of simulated.parts[0]!.staves) {
    staff.measures.forEach((measure, index) => {
      measure.index = index;
    });
  }
  return omrScoreDraftSchema.parse(simulated);
}

function materializeMeasure(
  facts: CandidateStaff,
  candidate: ContentRepairCandidate,
  candidateIndex: number,
): DraftMeasure {
  return {
    index: candidate.targetMeasureIndex,
    ...(facts.timeSignature === undefined ? {} : { timeSignature: facts.timeSignature }),
    ...(facts.duration === undefined ? {} : { duration: facts.duration }),
    ...(facts.keySignature === undefined ? {} : { keySignature: facts.keySignature }),
    ...(facts.clef === undefined ? {} : { clef: facts.clef }),
    ...(facts.repeat === undefined ? {} : { repeat: facts.repeat }),
    voices: facts.voices.map((voice) => ({
      index: voice.index,
      events: voice.events.map((event, eventIndex) => ({
        ...event,
        id: `repair-${candidate.candidateSha256.slice(0, 16)}-${candidateIndex}-${facts.staffIndex}-${voice.index}-${eventIndex}`,
      })),
    })),
  };
}

function incompatiblePrimary(): PdfOmrError {
  return new PdfOmrError("BENCHMARK_EVALUATION_LIMITATION", "repair candidates do not match the primary Draft", {
    context: { reason: "repair-candidate-primary-mismatch" },
  });
}
