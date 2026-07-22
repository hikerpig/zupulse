import type { HarmonyAnalysisInput } from "./analysisInput";
import type { ScoreWrittenMoment } from "./writtenTime";
import { compareMoments } from "./schemas";

export type LegalBoundaryLattice = { moments: ScoreWrittenMoment[]; mandatory: Set<string> };
export type HarmonyBoundaryPolicy = "dense-note-events" | "metric-beats" | "metric-half-beats" | "metric-strong-onsets";

export function buildLegalBoundaryLattice(
  input: Pick<HarmonyAnalysisInput, "ticksPerQuarter" | "measures" | "tracks"> & {
    mandatory?: readonly ScoreWrittenMoment[];
    maxOptionalPerMeasure?: number;
    policy?: HarmonyBoundaryPolicy;
  },
): LegalBoundaryLattice {
  const canonical = (moment: ScoreWrittenMoment): ScoreWrittenMoment => {
    const measureIndex = input.measures.findIndex((measure) => measure.index === moment.measureIndex);
    const measure = input.measures[measureIndex];
    const next = input.measures[measureIndex + 1];
    return measure && next && moment.offsetTicks === measure.durationTicks
      ? { measureIndex: next.index, offsetTicks: 0 }
      : moment;
  };
  const requestedMandatory = (input.mandatory ?? []).map(canonical);
  const mandatory = new Set(requestedMandatory.map(key));
  const candidates = input.measures.flatMap((measure) => {
    const starts = [
      { measureIndex: measure.index, offsetTicks: 0 },
      { measureIndex: measure.index, offsetTicks: measure.durationTicks },
    ];
    const notes = input.tracks
      .flatMap((track) => track.staves.flatMap((staff) => staff.notes))
      .filter((note) => note.moment.measureIndex === measure.index);
    const noteMoments =
      input.policy === "metric-strong-onsets"
        ? [...new Set(notes.map((note) => note.moment.offsetTicks))].flatMap((offsetTicks) => {
            const pitchClasses = new Set(
              notes
                .filter((note) => note.moment.offsetTicks === offsetTicks)
                .flatMap((note) => (note.soundingPitchClass === undefined ? [] : [note.soundingPitchClass])),
            );
            return pitchClasses.size >= 2 ? [{ measureIndex: measure.index, offsetTicks }] : [];
          })
        : input.policy !== undefined && input.policy !== "dense-note-events"
          ? []
          : notes.flatMap((note) => [
              note.moment,
              { measureIndex: note.moment.measureIndex, offsetTicks: note.moment.offsetTicks + note.durationTicks },
            ]);
    const denominatorBeat = (input.ticksPerQuarter * 4) / measure.timeSignature.denominator;
    const musicalBeat =
      input.policy !== undefined &&
      input.policy !== "dense-note-events" &&
      measure.timeSignature.numerator > 3 &&
      measure.timeSignature.numerator % 3 === 0
        ? denominatorBeat * 3
        : denominatorBeat;
    const beat = input.policy === "metric-half-beats" ? musicalBeat / 2 : musicalBeat;
    const metric = Array.from({ length: Math.ceil(measure.durationTicks / beat) }, (_, index) => ({
      measureIndex: measure.index,
      offsetTicks: index * beat,
    })).filter((moment) => moment.offsetTicks < measure.durationTicks);
    return [...starts, ...noteMoments, ...metric].map(canonical);
  });
  const unique = [...new Map([...candidates, ...requestedMandatory].map((moment) => [key(moment), moment])).values()];
  const moments = input.measures
    .flatMap((measure) =>
      unique.filter((moment) => moment.measureIndex === measure.index).sort((a, b) => a.offsetTicks - b.offsetTicks),
    )
    .filter(
      (moment) =>
        mandatory.has(key(moment)) ||
        moment.offsetTicks === 0 ||
        input.measures.some(
          (measure) => measure.index === moment.measureIndex && moment.offsetTicks === measure.durationTicks,
        ) ||
        optionalRank(moment, unique) <= (input.maxOptionalPerMeasure ?? 32),
    );
  return { moments: moments.sort(compareMoments), mandatory };
}
function optionalRank(moment: ScoreWrittenMoment, moments: readonly ScoreWrittenMoment[]): number {
  return moments.filter(
    (candidate) => candidate.measureIndex === moment.measureIndex && candidate.offsetTicks < moment.offsetTicks,
  ).length;
}
function key(moment: ScoreWrittenMoment): string {
  return `${moment.measureIndex}:${moment.offsetTicks}`;
}
