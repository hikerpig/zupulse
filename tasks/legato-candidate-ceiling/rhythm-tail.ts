import {
  addRational,
  compareRational,
  normalizeRational,
  type ExactRational,
} from "../../tools/pdf-omr-cli/src/rational";

type Event = {
  id: string;
  type: string;
  onset: ExactRational;
  duration: ExactRational;
  writtenPitch?: { step: string; octave: number } | undefined;
  tie?: string | undefined;
  tuplet?: unknown;
};
type Measure = { duration?: ExactRational | undefined; voices: { events: Event[] }[] };
export type RhythmSource = {
  safe: boolean;
  events: { type: string; pitch: number | null; layers: number | null; group: number | null }[];
};

export function correctRhythmTail<T extends Measure>(measure: T, source: RhythmSource): { reason: string; measure: T } {
  const reject = (reason: string) => ({ reason, measure });
  if (!source.safe) return reject("unsafe-source");
  if (measure.voices.length !== 1) return reject("multiple-voices");
  if (!measure.duration) return reject("missing-duration");
  const events = [...measure.voices[0]!.events].sort((a, b) => compareRational(a.onset, b.onset));
  if (events.some((e) => e.tie || e.tuplet)) return reject("connection-or-tuplet");
  let end = { numerator: 0, denominator: 1 };
  for (const e of events) {
    if (compareRational(e.onset, end) !== 0 || e.duration.numerator <= 0) return reject("nonsequential-voice");
    end = addRational(e.onset, e.duration);
  }
  if (compareRational(end, measure.duration) !== 0) return reject("nonsequential-voice");
  const last = source.events.at(-1);
  if (!last || last.type !== "note" || last.group === null) return reject("no-tail-beam-group");
  let start = source.events.length - 1;
  while (start > 0 && source.events[start - 1]!.group === last.group) start--;
  const group = source.events.slice(start);
  if (
    group.length < 2 ||
    group.some(
      (e) => e.type !== "note" || e.layers === null || !Number.isInteger(e.layers) || e.layers < 1 || e.layers > 4,
    )
  )
    return reject("unsupported-group");
  const extra = events.length - source.events.length;
  if (extra !== 0 && !(extra === 1 && events.at(-1)!.type === "rest")) return reject("event-correspondence");
  for (const [i, s] of source.events.entries()) {
    const e = events[i];
    if (!e || s.type !== e.type) return reject("event-correspondence");
    if (
      s.type === "note" &&
      (!e.writtenPitch || e.writtenPitch.octave * 7 + "CDEFGAB".indexOf(e.writtenPitch.step) !== s.pitch)
    )
      return reject("event-correspondence");
    if (s.type === "rest" && compareRational(e.duration, { numerator: 1, denominator: 4 }) !== 0)
      return reject("source-rest-duration");
  }
  let onset = normalizeRational(events[start]!.onset);
  const timing = group.map((s) => {
    const duration = { numerator: 1, denominator: 2 ** (s.layers! + 2) };
    const result = { onset, duration };
    onset = addRational(onset, duration);
    return result;
  });
  if (compareRational(onset, measure.duration) !== 0) return reject("group-does-not-close");
  const candidate = structuredClone(measure);
  // Rest deletion is permitted only after complete source correspondence, never just from the bar sum.
  candidate.voices[0]!.events = events
    .slice(0, source.events.length)
    .map((e, i) => ({ ...structuredClone(e), ...(i < start ? {} : timing[i - start]!) }));
  const changed =
    extra !== 0 ||
    timing.some(
      (t, i) =>
        compareRational(t.onset, events[start + i]!.onset) !== 0 ||
        compareRational(t.duration, events[start + i]!.duration) !== 0,
    );
  return changed ? { reason: "corrected", measure: candidate } : reject("unchanged");
}
