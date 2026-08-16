import { addRational, compareRational, normalizeRational, type ExactRational } from "./rational";
import type { OmrScoreDraft } from "./schemas";

type DraftEvent =
  OmrScoreDraft["parts"][number]["staves"][number]["measures"][number]["voices"][number]["events"][number];

const zero: ExactRational = { numerator: 0, denominator: 1 };

/**
 * OMR engines routinely drop beats. Fill unexplained voice gaps with implicit rests so the
 * draft stays structurally complete; every fill is reported as a warning diagnostic.
 */
export function fillVoiceGapsWithRests(draft: OmrScoreDraft): OmrScoreDraft {
  const diagnostics = [...draft.diagnostics];
  const parts = draft.parts.map((part) => ({
    ...part,
    staves: part.staves.map((staff) => ({
      ...staff,
      measures: staff.measures.map((measure) => {
        if (measure.duration === undefined) return measure;
        let filled = false;
        const voices = measure.voices.map((voice) => {
          const events = fillVoiceEvents(voice.events, measure.duration!, (fillIndex) =>
            [part.id, `m${measure.index}`, `s${staff.index}`, `v${voice.index}`, `fill${fillIndex}`].join("-"),
          );
          if (events === undefined) return voice;
          filled = true;
          return { ...voice, events };
        });
        if (!filled) return measure;
        addImplicitRestDiagnostic(diagnostics, measure.index);
        return { ...measure, voices };
      }),
    })),
  }));
  return { ...draft, parts, diagnostics };
}

function fillVoiceEvents(
  events: readonly DraftEvent[],
  measureDuration: ExactRational,
  fillId: (index: number) => string,
): DraftEvent[] | undefined {
  const sorted = [...events].sort((left, right) => compareRational(left.onset, right.onset));
  const filled: DraftEvent[] = [];
  let cursor = zero;
  let changed = false;
  let fillIndex = 0;
  for (const event of sorted) {
    if (compareRational(event.onset, cursor) > 0) {
      filled.push(createFillRest(fillId(fillIndex), cursor, subtractRational(event.onset, cursor)));
      fillIndex += 1;
      changed = true;
    }
    filled.push(event);
    const end = addRational(event.onset, event.duration);
    if (compareRational(end, cursor) > 0) cursor = end;
  }
  if (compareRational(measureDuration, cursor) > 0) {
    filled.push(createFillRest(fillId(fillIndex), cursor, subtractRational(measureDuration, cursor)));
    changed = true;
  }
  return changed ? filled : undefined;
}

function createFillRest(id: string, onset: ExactRational, duration: ExactRational): DraftEvent {
  return { type: "rest", id, onset, duration };
}

function subtractRational(left: ExactRational, right: ExactRational): ExactRational {
  return addRational(left, normalizeRational({ numerator: -right.numerator, denominator: right.denominator }));
}

function addImplicitRestDiagnostic(diagnostics: OmrScoreDraft["diagnostics"], measureIndex: number): void {
  const message = `implicit rest inserted in measure ${measureIndex}`;
  if (diagnostics.some((diagnostic) => diagnostic.code === "IMPLICIT_REST_FILL" && diagnostic.message === message)) {
    return;
  }
  diagnostics.push({ code: "IMPLICIT_REST_FILL", severity: "warning", message });
}
