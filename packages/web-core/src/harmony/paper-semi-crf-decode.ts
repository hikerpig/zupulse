import {
  scorePaperSemiCrfLocalPotential,
  type PaperSemiCrfLocalPotential,
  type PaperSemiCrfSegment,
} from "./paper-semi-crf-model";

export type PaperSemiCrfPath = {
  score: number;
  segments: PaperSemiCrfSegment[];
};

export function decodePaperSemiCrf(input: {
  eventCount: number;
  labelCount: number;
  maxSegmentLength: number;
  potential: PaperSemiCrfLocalPotential;
}): PaperSemiCrfPath {
  requirePositiveInteger(input.labelCount);
  requirePositiveInteger(input.maxSegmentLength);
  if (!Number.isSafeInteger(input.eventCount) || input.eventCount < 0) {
    throw new Error("invalid paper semi-CRF lattice");
  }
  if (input.eventCount === 0) return { score: 0, segments: [] };

  const pathsByEnd: Array<Map<number, PaperSemiCrfPath>> = Array.from(
    { length: input.eventCount + 1 },
    () => new Map(),
  );
  for (let endEvent = 1; endEvent <= input.eventCount; endEvent += 1) {
    const pathsByLabel = pathsByEnd[endEvent]!;
    const earliestStart = Math.max(0, endEvent - input.maxSegmentLength);
    for (let labelId = 0; labelId < input.labelCount; labelId += 1) {
      let best: PaperSemiCrfPath | undefined;
      for (let startEvent = earliestStart; startEvent < endEvent; startEvent += 1) {
        const segment = { startEvent, endEvent, labelId };
        if (startEvent === 0) {
          best = chooseBetter(best, {
            score: scorePaperSemiCrfLocalPotential(input.potential, { segment }),
            segments: [segment],
          });
          continue;
        }
        for (const [previousLabelId, previous] of pathsByEnd[startEvent]!) {
          const localScore = scorePaperSemiCrfLocalPotential(input.potential, {
            segment,
            previousLabelId,
          });
          best = chooseBetter(best, {
            score: previous.score + localScore,
            segments: [...previous.segments, segment],
          });
        }
      }
      if (best) pathsByLabel.set(labelId, best);
    }
  }

  let best: PaperSemiCrfPath | undefined;
  for (const candidate of pathsByEnd[input.eventCount]!.values()) best = chooseBetter(best, candidate);
  if (!best) throw new Error("invalid paper semi-CRF lattice");
  return best;
}

function chooseBetter(current: PaperSemiCrfPath | undefined, candidate: PaperSemiCrfPath): PaperSemiCrfPath {
  return current === undefined || comparePaths(candidate, current) < 0 ? candidate : current;
}

function comparePaths(left: PaperSemiCrfPath, right: PaperSemiCrfPath): number {
  if (left.score !== right.score) return right.score - left.score;
  if (left.segments.length !== right.segments.length) return left.segments.length - right.segments.length;
  for (let index = 0; index < left.segments.length; index += 1) {
    const leftSegment = left.segments[index]!;
    const rightSegment = right.segments[index]!;
    const labelOrder = leftSegment.labelId - rightSegment.labelId;
    if (labelOrder !== 0) return labelOrder;
    const endOrder = rightSegment.endEvent - leftSegment.endEvent;
    if (endOrder !== 0) return endOrder;
  }
  return 0;
}

function requirePositiveInteger(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error("invalid paper semi-CRF lattice");
}
