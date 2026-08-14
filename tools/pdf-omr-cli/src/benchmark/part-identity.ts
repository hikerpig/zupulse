import { PdfOmrError } from "../errors";
import type { OmrScoreDraft } from "../schemas";

export type PartIdentityMapping = {
  predictedId: string;
  expectedId: string;
};

export type AlignedDraftParts = {
  draft: OmrScoreDraft;
  mapping: readonly PartIdentityMapping[];
};

/**
 * Aligns engine output to ground truth using structural roles, never raw part IDs.
 * A role collision is an evaluation limitation rather than a zero-score prediction.
 */
export function alignDraftParts(predicted: OmrScoreDraft, expected: OmrScoreDraft): AlignedDraftParts {
  if (predicted.parts.length !== expected.parts.length) {
    throw limitation("part-count-mismatch", {
      predictedPartCount: predicted.parts.length,
      expectedPartCount: expected.parts.length,
    });
  }

  const available = new Set(expected.parts.map((part) => part.id));
  const mapping: PartIdentityMapping[] = [];
  for (const part of predicted.parts) {
    const candidates = expected.parts.filter(
      (candidate) => available.has(candidate.id) && sameStructuralRole(part, candidate),
    );
    const selected = selectCandidate(part, candidates);
    if (selected === undefined) {
      throw limitation("part-role-unresolved", {
        predictedPartId: part.id,
        predictedPartName: part.name,
        candidatePartIds: candidates.map((candidate) => candidate.id),
      });
    }
    available.delete(selected.id);
    mapping.push({ predictedId: part.id, expectedId: selected.id });
  }

  return {
    draft: {
      ...predicted,
      parts: mapping.map(({ expectedId, predictedId }) => ({
        ...predicted.parts.find((part) => part.id === predictedId)!,
        id: expectedId,
      })),
    },
    mapping: mapping.map((entry) => ({ ...entry })),
  };
}

function sameStructuralRole(left: OmrScoreDraft["parts"][number], right: OmrScoreDraft["parts"][number]): boolean {
  return left.staves.length === right.staves.length;
}

function selectCandidate(
  predicted: OmrScoreDraft["parts"][number],
  candidates: readonly OmrScoreDraft["parts"][number][],
): OmrScoreDraft["parts"][number] | undefined {
  if (candidates.length === 1) return candidates[0];
  if (candidates.length === 0) return undefined;
  const predictedTokens = nameTokens(predicted.name);
  const nameMatches = candidates.filter((candidate) => {
    const candidateTokens = nameTokens(candidate.name);
    return predictedTokens.some((token) => candidateTokens.includes(token));
  });
  return nameMatches.length === 1 ? nameMatches[0] : undefined;
}

function nameTokens(name: string): string[] {
  return name
    .toLocaleLowerCase("en-US")
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1 && !["part", "voice", "staff"].includes(token));
}

function limitation(reason: string, context: Readonly<Record<string, unknown>>): PdfOmrError {
  return new PdfOmrError("BENCHMARK_EVALUATION_LIMITATION", "benchmark evaluation cannot establish part identity", {
    context: { reason, ...context },
  });
}
