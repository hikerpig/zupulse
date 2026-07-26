import { describe, expect, it } from "vitest";
import { decodePaperSemiCrf } from "../paper-semi-crf-decode";
import type {
  PaperSemiCrfLocalPotential,
  PaperSemiCrfLocalPotentialInput,
  PaperSemiCrfSegment,
} from "../paper-semi-crf-model";

describe("paper semi-CRF exact Viterbi", () => {
  it("matches an independently enumerated tiny lattice", () => {
    const potential: PaperSemiCrfLocalPotential = ({ segment, previousLabelId }) =>
      (segment.endEvent - segment.startEvent) * [0.2, 0.6][segment.labelId]! +
      (segment.startEvent === 1 && segment.labelId === 0 ? 1.3 : 0) +
      (previousLabelId === 0 && segment.labelId === 1 ? 0.7 : 0);
    const expected = exhaustiveBestPath({
      eventCount: 4,
      labelCount: 2,
      maxSegmentLength: 2,
      potential,
    });

    const actual = decodePaperSemiCrf({
      eventCount: 4,
      labelCount: 2,
      maxSegmentLength: 2,
      potential,
    });

    expect(actual).toEqual(expected);
  });

  it("scores every frozen label instead of applying a Top-8 proposal cutoff", () => {
    const result = decodePaperSemiCrf({
      eventCount: 2,
      labelCount: 12,
      maxSegmentLength: 2,
      potential: ({ segment }) => (segment.labelId === 11 ? (segment.endEvent - segment.startEvent) * 10 : 0),
    });

    expect(result.segments).toEqual([{ startEvent: 0, endEvent: 2, labelId: 11 }]);
    expect(result.score).toBe(20);
  });

  it("breaks exact-score ties by fewer segments and then lower label ids", () => {
    const result = decodePaperSemiCrf({
      eventCount: 3,
      labelCount: 2,
      maxSegmentLength: 3,
      potential: () => 0,
    });

    expect(result).toEqual({
      score: 0,
      segments: [{ startEvent: 0, endEvent: 3, labelId: 0 }],
    });
  });

  it("rejects non-finite local potentials", () => {
    expect(() =>
      decodePaperSemiCrf({
        eventCount: 1,
        labelCount: 1,
        maxSegmentLength: 1,
        potential: () => Number.NaN,
      }),
    ).toThrow("non-finite paper semi-CRF potential");
  });
});

function exhaustiveBestPath(input: {
  eventCount: number;
  labelCount: number;
  maxSegmentLength: number;
  potential: PaperSemiCrfLocalPotential;
}): { score: number; segments: PaperSemiCrfSegment[] } {
  const paths: PaperSemiCrfSegment[][] = [];
  const visit = (segments: PaperSemiCrfSegment[], startEvent: number): void => {
    if (startEvent === input.eventCount) {
      paths.push(segments);
      return;
    }
    for (
      let endEvent = startEvent + 1;
      endEvent <= Math.min(input.eventCount, startEvent + input.maxSegmentLength);
      endEvent += 1
    ) {
      for (let labelId = 0; labelId < input.labelCount; labelId += 1) {
        visit([...segments, { startEvent, endEvent, labelId }], endEvent);
      }
    }
  };
  visit([], 0);
  return paths
    .map((segments) => ({
      segments,
      score: segments.reduce((score, segment, index) => {
        const potentialInput: PaperSemiCrfLocalPotentialInput = {
          segment,
          ...(index === 0 ? {} : { previousLabelId: segments[index - 1]!.labelId }),
        };
        return score + input.potential(potentialInput);
      }, 0),
    }))
    .sort(comparePaths)[0]!;
}

function comparePaths(
  left: { score: number; segments: PaperSemiCrfSegment[] },
  right: { score: number; segments: PaperSemiCrfSegment[] },
): number {
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
