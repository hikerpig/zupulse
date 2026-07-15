import {
  buildHarmonyFeatureCache,
  generateHarmonyCandidates,
  type ScoreWrittenRange,
} from "../packages/web-core/src/index";

type OracleNote = {
  moment: { measureIndex: number; offsetTicks: number };
  durationTicks: number;
  soundingPitchClass?: number;
  soundingMidi?: number;
  voice: number;
};

export function generateOracleCandidates(input: {
  ticksPerQuarter: number;
  range: ScoreWrittenRange;
  notes: readonly OracleNote[];
}) {
  const cache = buildHarmonyFeatureCache({ ticksPerQuarter: input.ticksPerQuarter, notes: input.notes });
  return generateHarmonyCandidates(input.range, cache.forRange(input.range), { topK: 8 });
}
