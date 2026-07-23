import {
  buildLegalBoundaryLattice,
  createBoundaryEvidenceCache,
  type ChordSymbolInput,
  type HarmonyAnalysisInput,
  type ScoreWrittenMoment,
  type ScoreWrittenRange,
} from "@zupulse/web-core";
import type { V3DatasetRole } from "./evaluationProtocol";

export type HarmonyBoundaryRecord = {
  id: string;
  corpus: string;
  groupId: string;
  moment: ScoreWrittenMoment;
  target: 0 | 1;
  features: number[];
};

type BoundaryGold = { range: ScoreWrittenRange; chord?: ChordSymbolInput };
type BoundaryRecordRequest = {
  corpus: string;
  groupId: string;
  role: V3DatasetRole;
  input: HarmonyAnalysisInput;
  includedTrackIds: readonly string[];
  gold: readonly BoundaryGold[];
};

export function createBoundaryTrainingRecords(request: BoundaryRecordRequest): HarmonyBoundaryRecord[] {
  if (request.role !== "train")
    throw new Error(`boundary records require train role: ${request.groupId} is ${request.role}`);
  return createRecords(request);
}

export function createBoundaryEvaluationRecords(request: BoundaryRecordRequest): HarmonyBoundaryRecord[] {
  if (request.role !== "tune")
    throw new Error(`boundary evaluation records require tune role: ${request.groupId} is ${request.role}`);
  return createRecords(request);
}

function createRecords(request: BoundaryRecordRequest): HarmonyBoundaryRecord[] {
  const included = new Set(request.includedTrackIds);
  const input = {
    ...request.input,
    tracks: request.input.tracks.filter((track) => included.has(track.id) && !track.isPercussion),
  };
  const dense = buildLegalBoundaryLattice({ ...input, policy: "dense-note-events" }).moments;
  const fixed = new Set(buildLegalBoundaryLattice({ ...input, policy: "metric-beats" }).moments.map(momentKey));
  const evidence = createBoundaryEvidenceCache(input);
  const goldChanges = new Set(
    request.gold.flatMap((item, index) => {
      const previous = request.gold[index - 1];
      return index > 0 && item.chord && previous?.chord && !sameChord(item.chord, previous.chord)
        ? [momentKey(item.range.start)]
        : [];
    }),
  );
  return dense
    .filter((moment) => !fixed.has(momentKey(moment)))
    .map((moment) => ({
      id: `${request.corpus}:${request.groupId}:${moment.measureIndex}:${moment.offsetTicks}`,
      corpus: request.corpus,
      groupId: request.groupId,
      moment,
      target: goldChanges.has(momentKey(moment)) ? (1 as const) : (0 as const),
      features: evidence.forMoment(moment),
    }));
}

function momentKey(moment: ScoreWrittenMoment): string {
  return `${moment.measureIndex}:${moment.offsetTicks}`;
}

function sameChord(a: ChordSymbolInput, b: ChordSymbolInput): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
