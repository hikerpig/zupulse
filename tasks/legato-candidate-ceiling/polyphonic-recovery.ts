import type { OmrScoreDraft } from "../../tools/pdf-omr-cli/src/schemas";
import { compareRational } from "../../tools/pdf-omr-cli/src/rational";
export type Measure = OmrScoreDraft["parts"][number]["staves"][number]["measures"][number];
type Source = { supported: boolean; movingPitches: [number, number]; sustainedPitch: number };
const q = (numerator: number, denominator = 1) => ({ numerator, denominator });
export function recoverPolyphonic(measure: Measure, source: Source): { reason: string; measure: Measure } {
  const reject = (reason: string) => ({ reason, measure });
  if (!source.supported) return reject("source-unsupported");
  const fifths = measure.keySignature?.fifths;
  if (fifths === undefined || !Number.isInteger(fifths) || Math.abs(fifths) > 7) return reject("key-anchor");
  if (!measure.duration || compareRational(measure.duration, q(3, 4)) !== 0 || measure.voices.length !== 2)
    return reject("measure-shape");
  const notes = measure.voices.map((v) => v.events[0]);
  if (
    measure.voices.some((v) => v.events.length !== 1) ||
    notes.some(
      (e) =>
        !e ||
        e.type !== "note" ||
        !e.writtenPitch ||
        e.tie !== undefined ||
        e.tuplet !== undefined ||
        compareRational(e.onset, q(0)) !== 0 ||
        compareRational(e.duration, q(3, 4)) !== 0,
    )
  )
    return reject("candidate-shape");
  const natural = notes.map((e) =>
    e?.type === "note" && e.writtenPitch ? e.writtenPitch.octave * 7 + "CDEFGAB".indexOf(e.writtenPitch.step) : -1,
  );
  const moving = natural.flatMap((p, i) => (p === source.movingPitches[0] ? [i] : []));
  const held = natural.flatMap((p, i) => (p === source.sustainedPitch ? [i] : []));
  if (moving.length !== 1 || held.length !== 1 || moving[0] === held[0]) return reject("voice-mapping");
  const next = source.movingPitches[1];
  if (!Number.isInteger(next) || next < 0 || next >= 70 || natural.includes(next)) return reject("new-pitch");
  const steps = ["C", "D", "E", "F", "G", "A", "B"] as const;
  const step = steps[next % 7]!;
  // Source certifies no local accidental and a distinct new pitch; retain the frozen candidate key as an explicit anchor.
  const order = fifths < 0 ? "BEADGCF" : "FCGDAEB";
  const alter = order.slice(0, Math.abs(fifths)).includes(step) ? Math.sign(fifths) : 0;
  const octave = Math.floor(next / 7);
  const midi = (octave + 1) * 12 + [0, 2, 4, 5, 7, 9, 11][next % 7]! + alter;
  if (midi < 0 || midi > 127) return reject("midi-range");
  const after = structuredClone(measure);
  const voice = after.voices[moving[0]!]!;
  const first = voice.events[0]!;
  first.duration = q(1, 2);
  voice.events.push({
    id: `${first.id}-source-following`,
    type: "note",
    onset: q(1, 2),
    duration: q(1, 4),
    writtenPitch: { step, alter, octave },
    soundingMidi: midi,
  });
  return { reason: "corrected", measure: after };
}
