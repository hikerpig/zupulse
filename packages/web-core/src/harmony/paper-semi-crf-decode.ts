import {
  scorePaperSemiCrfLocalPotential,
  type PaperSemiCrfLocalPotential,
  type PaperSemiCrfSegment,
} from "./paper-semi-crf-model";

export type PaperSemiCrfPath = {
  score: number;
  segments: PaperSemiCrfSegment[];
};

type PaperSemiCrfState = {
  score: number;
  segmentCount: number;
  segment: PaperSemiCrfSegment;
  previous?: PaperSemiCrfState;
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

  const pathsByEnd: Array<Map<number, PaperSemiCrfState>> = Array.from(
    { length: input.eventCount + 1 },
    () => new Map(),
  );
  for (let endEvent = 1; endEvent <= input.eventCount; endEvent += 1) {
    const pathsByLabel = pathsByEnd[endEvent]!;
    const earliestStart = Math.max(0, endEvent - input.maxSegmentLength);
    for (let labelId = 0; labelId < input.labelCount; labelId += 1) {
      let best: PaperSemiCrfState | undefined;
      for (let startEvent = earliestStart; startEvent < endEvent; startEvent += 1) {
        const segment = { startEvent, endEvent, labelId };
        if (startEvent === 0) {
          best = chooseBetter(best, {
            score: scorePaperSemiCrfLocalPotential(input.potential, { segment }),
            segmentCount: 1,
            segment,
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
            segmentCount: previous.segmentCount + 1,
            segment,
            previous,
          });
        }
      }
      if (best) pathsByLabel.set(labelId, best);
    }
  }

  let best: PaperSemiCrfState | undefined;
  for (const candidate of pathsByEnd[input.eventCount]!.values()) best = chooseBetter(best, candidate);
  if (!best) throw new Error("invalid paper semi-CRF lattice");
  return { score: best.score, segments: stateSegments(best) };
}

export function decodePaperSemiCrfFactorized(input: {
  eventCount: number;
  labelCount: number;
  maxSegmentLength: number;
  segmentPotential: (segment: PaperSemiCrfSegment) => number;
  transitionPotential: (currentLabelId: number, previousLabelId: number) => number;
}): PaperSemiCrfPath {
  requirePositiveInteger(input.labelCount);
  requirePositiveInteger(input.maxSegmentLength);
  if (!Number.isSafeInteger(input.eventCount) || input.eventCount < 0) {
    throw new Error("invalid paper semi-CRF lattice");
  }
  if (input.eventCount === 0) return { score: 0, segments: [] };

  const pathsByEnd: Array<Map<number, PaperSemiCrfState>> = Array.from(
    { length: input.eventCount + 1 },
    () => new Map(),
  );
  const incomingByStart: Array<Array<{ score: number; previous: PaperSemiCrfState }> | undefined> = Array.from({
    length: input.eventCount + 1,
  });
  const incomingAt = (startEvent: number) => {
    const cached = incomingByStart[startEvent];
    if (cached !== undefined) return cached;
    const incoming = Array.from({ length: input.labelCount }, (_, currentLabelId) => {
      let best: PaperSemiCrfState | undefined;
      let bestScore = Number.NEGATIVE_INFINITY;
      for (const [previousLabelId, previous] of pathsByEnd[startEvent]!) {
        const transition = finitePotential(input.transitionPotential(currentLabelId, previousLabelId));
        const score = previous.score + transition;
        const candidate: PaperSemiCrfState = { ...previous, score };
        if (best === undefined || comparePaths(candidate, best) < 0) {
          best = candidate;
          bestScore = score;
        }
      }
      if (best === undefined) throw new Error("invalid paper semi-CRF lattice");
      return { score: bestScore, previous: pathsByEnd[startEvent]!.get(best.segment.labelId) ?? best };
    });
    incomingByStart[startEvent] = incoming;
    return incoming;
  };

  for (let endEvent = 1; endEvent <= input.eventCount; endEvent += 1) {
    const pathsByLabel = pathsByEnd[endEvent]!;
    const earliestStart = Math.max(0, endEvent - input.maxSegmentLength);
    for (let labelId = 0; labelId < input.labelCount; labelId += 1) {
      let best: PaperSemiCrfState | undefined;
      for (let startEvent = earliestStart; startEvent < endEvent; startEvent += 1) {
        const segment = { startEvent, endEvent, labelId };
        const segmentScore = finitePotential(input.segmentPotential(segment));
        if (startEvent === 0) {
          best = chooseBetter(best, { score: segmentScore, segmentCount: 1, segment });
          continue;
        }
        const incoming = incomingAt(startEvent)[labelId]!;
        best = chooseBetter(best, {
          score: incoming.score + segmentScore,
          segmentCount: incoming.previous.segmentCount + 1,
          segment,
          previous: incoming.previous,
        });
      }
      if (best) pathsByLabel.set(labelId, best);
    }
  }

  let best: PaperSemiCrfState | undefined;
  for (const candidate of pathsByEnd[input.eventCount]!.values()) best = chooseBetter(best, candidate);
  if (!best) throw new Error("invalid paper semi-CRF lattice");
  return { score: best.score, segments: stateSegments(best) };
}

function chooseBetter(current: PaperSemiCrfState | undefined, candidate: PaperSemiCrfState): PaperSemiCrfState {
  return current === undefined || comparePaths(candidate, current) < 0 ? candidate : current;
}

function comparePaths(left: PaperSemiCrfState, right: PaperSemiCrfState): number {
  if (left.score !== right.score) return right.score - left.score;
  if (left.segmentCount !== right.segmentCount) return left.segmentCount - right.segmentCount;
  const leftSegments = stateSegments(left);
  const rightSegments = stateSegments(right);
  for (let index = 0; index < leftSegments.length; index += 1) {
    const leftSegment = leftSegments[index]!;
    const rightSegment = rightSegments[index]!;
    const labelOrder = leftSegment.labelId - rightSegment.labelId;
    if (labelOrder !== 0) return labelOrder;
    const endOrder = rightSegment.endEvent - leftSegment.endEvent;
    if (endOrder !== 0) return endOrder;
  }
  return 0;
}

function stateSegments(state: PaperSemiCrfState): PaperSemiCrfSegment[] {
  const segments = Array.from<PaperSemiCrfSegment>({ length: state.segmentCount });
  let current: PaperSemiCrfState | undefined = state;
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    segments[index] = current!.segment;
    current = current!.previous;
  }
  return segments;
}

function finitePotential(value: number): number {
  if (!Number.isFinite(value)) throw new Error("non-finite paper semi-CRF potential");
  return value;
}

function requirePositiveInteger(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error("invalid paper semi-CRF lattice");
}
