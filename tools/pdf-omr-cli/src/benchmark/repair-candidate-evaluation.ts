import { PdfOmrError } from "../errors";
import { omrScoreDraftSchema, type OmrScoreDraft } from "../schemas";
import {
  createComparisonView,
  engineDraftComparisonSchema,
  fingerprintDraftMeasures,
  type EngineDraftComparison,
} from "./engine-comparison";
import { alignDraftParts } from "./part-identity";
import { computeSymbolicMetrics, type SymbolicMetrics } from "./symbolic-metrics";

export type RepairCandidateEvaluation = {
  appliedCandidateCount: number;
  before: SymbolicMetrics;
  after: SymbolicMetrics;
};

export type IndividualRepairCandidateEvaluation = {
  candidateSha256: string;
  operation: RepairCandidate["operation"];
  before: SymbolicMetrics;
  after: SymbolicMetrics;
};

type RepairCandidate = NonNullable<EngineDraftComparison["proposals"][number]["repairCandidate"]>;
type ContentRepairCandidate = Extract<RepairCandidate, { operation: "insert" | "replace" }>;
type CandidateStaff = ContentRepairCandidate["measure"]["staves"][number];
type DraftMeasure = OmrScoreDraft["parts"][number]["staves"][number]["measures"][number];
type PreparedEvaluation = {
  primary: OmrScoreDraft;
  expected: OmrScoreDraft;
  comparison: EngineDraftComparison;
  candidates: readonly RepairCandidate[];
  before: SymbolicMetrics;
};

export function evaluateRepairCandidates(
  primaryInput: OmrScoreDraft,
  expectedInput: OmrScoreDraft,
  comparisonInput: EngineDraftComparison,
): RepairCandidateEvaluation {
  const prepared = prepareEvaluation(primaryInput, expectedInput, comparisonInput);
  return evaluateSelection(
    prepared,
    prepared.candidates.map((candidate) => candidate.candidateSha256),
  );
}

export function evaluateRepairCandidateSelection(
  primaryInput: OmrScoreDraft,
  expectedInput: OmrScoreDraft,
  comparisonInput: EngineDraftComparison,
  candidateSha256s: readonly string[],
): RepairCandidateEvaluation {
  return evaluateSelection(prepareEvaluation(primaryInput, expectedInput, comparisonInput), candidateSha256s);
}

function evaluateSelection(
  prepared: PreparedEvaluation,
  candidateSha256s: readonly string[],
): RepairCandidateEvaluation {
  const selected = new Set(candidateSha256s);
  const available = new Set(prepared.candidates.map((candidate) => candidate.candidateSha256));
  if (
    selected.size !== candidateSha256s.length ||
    [...selected].some((candidateSha256) => !available.has(candidateSha256))
  ) {
    throw incompatiblePrimary();
  }
  const selectedComparison: EngineDraftComparison = {
    ...prepared.comparison,
    proposals: prepared.comparison.proposals.filter(
      (proposal) => proposal.repairCandidate !== undefined && selected.has(proposal.repairCandidate.candidateSha256),
    ),
  };
  const simulated = simulateRepairCandidates(prepared.primary, selectedComparison);
  return {
    appliedCandidateCount: selected.size,
    before: prepared.before,
    after: computeSymbolicMetrics(alignDraftParts(simulated, prepared.expected).draft, prepared.expected),
  };
}

export function evaluateRepairCandidatesIndividually(
  primaryInput: OmrScoreDraft,
  expectedInput: OmrScoreDraft,
  comparisonInput: EngineDraftComparison,
): readonly IndividualRepairCandidateEvaluation[] {
  const prepared = prepareEvaluation(primaryInput, expectedInput, comparisonInput);
  return prepared.candidates.map((candidate) => {
    const result = evaluateSelection(prepared, [candidate.candidateSha256]);
    return {
      candidateSha256: candidate.candidateSha256,
      operation: candidate.operation,
      before: result.before,
      after: result.after,
    };
  });
}

function prepareEvaluation(
  primaryInput: OmrScoreDraft,
  expectedInput: OmrScoreDraft,
  comparisonInput: EngineDraftComparison,
): PreparedEvaluation {
  const comparison = engineDraftComparisonSchema.parse(comparisonInput);
  const primary = createComparisonView(omrScoreDraftSchema.parse(primaryInput), comparison.topologyMode);
  const expected = createComparisonView(omrScoreDraftSchema.parse(expectedInput), comparison.topologyMode);
  return {
    primary,
    expected,
    comparison,
    candidates: comparison.proposals.flatMap((proposal) =>
      proposal.repairCandidate === undefined ? [] : [proposal.repairCandidate],
    ),
    before: computeSymbolicMetrics(alignDraftParts(primary, expected).draft, expected),
  };
}

function simulateRepairCandidates(primary: OmrScoreDraft, comparison: EngineDraftComparison): OmrScoreDraft {
  const candidates = comparison.proposals.flatMap((proposal) =>
    proposal.repairCandidate === undefined ? [] : [proposal.repairCandidate],
  );
  const fingerprints = fingerprintDraftMeasures(primary);
  if (fingerprints.length !== comparison.primaryMeasureCount) throw incompatiblePrimary();
  const staves = primary.parts[0]!.staves;
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
