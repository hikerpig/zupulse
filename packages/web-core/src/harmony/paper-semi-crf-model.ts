export type PaperSemiCrfSegment = {
  startEvent: number;
  endEvent: number;
  labelId: number;
};

export type PaperSemiCrfLocalPotentialInput = {
  segment: PaperSemiCrfSegment;
  previousLabelId?: number;
};

export type PaperSemiCrfLocalPotential = (input: PaperSemiCrfLocalPotentialInput) => number;

export function scorePaperSemiCrfLocalPotential(
  potential: PaperSemiCrfLocalPotential,
  input: PaperSemiCrfLocalPotentialInput,
): number {
  const score = potential(input);
  if (!Number.isFinite(score)) throw new Error("non-finite paper semi-CRF potential");
  return score;
}
