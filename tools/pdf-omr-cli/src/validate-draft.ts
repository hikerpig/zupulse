import { addRational, compareRational, normalizeRational, safeLcm, type ExactRational } from "./rational";
import type { OmrScoreDraft } from "./schemas";

type Diagnostic = OmrScoreDraft["diagnostics"][number];
type Readiness = "blocked" | "ready-with-warnings" | "ready";
type Scope = "harmony" | "musicXml";

export type DraftValidationReport = {
  schemaVersion: "1.0.0";
  diagnostics: Diagnostic[];
  readiness: {
    harmony: Readiness;
    musicXml: Readiness;
  };
};

const musicXmlOnlyCodes = new Set(["MISSING_CLEF", "MISSING_KEY_SIGNATURE"]);
const maxTicksPerWhole = 1_000_000;

export function validateDraft(
  draft: OmrScoreDraft,
  options: { pages?: readonly { width: number; height: number }[] } = {},
): DraftValidationReport {
  const diagnostics = [...draft.diagnostics];
  let projectionLcm = 1;

  for (const part of draft.parts) {
    const measureCounts = new Set(part.staves.map((staff) => staff.measures.length));
    if (measureCounts.size > 1) add(diagnostics, "STAFF_MEASURE_COUNT_MISMATCH", "staff measure counts do not align");
    const openTies = new Set<string>();
    for (const staff of part.staves) {
      for (const measure of staff.measures) {
        if (measure.timeSignature === undefined) {
          add(diagnostics, "MISSING_TIME_SIGNATURE", `measure ${measure.index} has no time signature`);
        }
        if (measure.duration === undefined) {
          add(diagnostics, "MISSING_MEASURE_DURATION", `measure ${measure.index} has no duration`);
        } else if (
          measure.timeSignature !== undefined &&
          compareRational(measure.duration, {
            numerator: measure.timeSignature.numerator,
            denominator: measure.timeSignature.denominator,
          }) !== 0
        ) {
          add(diagnostics, "MEASURE_DURATION_MISMATCH", `measure ${measure.index} duration differs from its meter`);
        }
        if (measure.clef === undefined) add(diagnostics, "MISSING_CLEF", `measure ${measure.index} has no clef`);
        if (measure.keySignature === undefined) {
          add(diagnostics, "MISSING_KEY_SIGNATURE", `measure ${measure.index} has no key signature`);
        }
        for (const voice of measure.voices) {
          const sorted = [...voice.events].sort((left, right) => compareRational(left.onset, right.onset));
          let previousOnset: ExactRational | undefined;
          let previousEnd: ExactRational = { numerator: 0, denominator: 1 };
          for (const event of sorted) {
            try {
              const onset = normalizeRational(event.onset);
              const duration = normalizeRational(event.duration);
              projectionLcm = safeLcm(projectionLcm, onset.denominator);
              projectionLcm = safeLcm(projectionLcm, duration.denominator);
              if (projectionLcm > maxTicksPerWhole) throw new Error("tick-limit");
              const end = addRational(onset, duration);
              const sameOnset = previousOnset !== undefined && compareRational(onset, previousOnset) === 0;
              if (!sameOnset && compareRational(onset, previousEnd) < 0) {
                add(diagnostics, "VOICE_EVENT_OVERLAP", `voice ${voice.index} overlaps in measure ${measure.index}`);
              }
              if (!sameOnset && compareRational(onset, previousEnd) > 0) {
                add(
                  diagnostics,
                  "VOICE_DURATION_MISMATCH",
                  `voice ${voice.index} has an unexplained gap in measure ${measure.index}`,
                );
              }
              if (sameOnset && compareRational(end, previousEnd) !== 0) {
                add(
                  diagnostics,
                  "CHORD_DURATION_MISMATCH",
                  `simultaneous events have different duration in measure ${measure.index}`,
                );
              }
              if (!sameOnset || compareRational(end, previousEnd) > 0) previousEnd = end;
              previousOnset = onset;
            } catch {
              add(
                diagnostics,
                "UNSAFE_RATIONAL_PROJECTION",
                `event ${event.id} cannot be projected to bounded exact ticks`,
              );
            }
            inspectPitchAndTie(event, part.id, staff.index, voice.index, openTies, diagnostics);
            inspectSource(event, options.pages, diagnostics);
          }
          if (measure.duration !== undefined && compareRational(previousEnd, measure.duration) !== 0) {
            add(diagnostics, "VOICE_DURATION_MISMATCH", `voice ${voice.index} does not fill measure ${measure.index}`);
          }
        }
      }
    }
    for (const tie of openTies) add(diagnostics, "UNRESOLVED_TIE", `tie ${tie} has no endpoint`);
  }

  return {
    schemaVersion: "1.0.0",
    diagnostics,
    readiness: {
      harmony: readinessFor(diagnostics, "harmony"),
      musicXml: readinessFor(diagnostics, "musicXml"),
    },
  };
}

function inspectPitchAndTie(
  event: OmrScoreDraft["parts"][number]["staves"][number]["measures"][number]["voices"][number]["events"][number],
  partId: string,
  staffIndex: number,
  voiceIndex: number,
  openTies: Set<string>,
  diagnostics: Diagnostic[],
): void {
  if (event.type !== "note") return;
  if (event.writtenPitch === undefined && event.soundingMidi === undefined) {
    add(diagnostics, "MISSING_PITCH", `note ${event.id} has no pitch`);
    return;
  }
  const pitch =
    event.soundingMidi?.toString() ??
    `${event.writtenPitch!.step}${event.writtenPitch!.alter}:${event.writtenPitch!.octave}`;
  const key = `${partId}:${staffIndex}:${voiceIndex}:${pitch}`;
  if (event.tie === "start") openTies.add(key);
  if (event.tie === "continue" && !openTies.has(key)) {
    add(diagnostics, "INVALID_TIE", `continued tie ${key} has no start`);
  }
  if (event.tie === "end") {
    if (!openTies.delete(key)) add(diagnostics, "INVALID_TIE", `ended tie ${key} has no start`);
  }
}

function inspectSource(
  event: OmrScoreDraft["parts"][number]["staves"][number]["measures"][number]["voices"][number]["events"][number],
  pages: readonly { width: number; height: number }[] | undefined,
  diagnostics: Diagnostic[],
): void {
  if (event.source?.bbox === undefined || pages === undefined) return;
  const page = pages[event.source.pageIndex];
  const box = event.source.bbox;
  if (page === undefined || box.x + box.width > page.width || box.y + box.height > page.height) {
    add(diagnostics, "SOURCE_OUT_OF_BOUNDS", `event ${event.id} source is outside its PDF page`);
  }
}

function readinessFor(diagnostics: readonly Diagnostic[], scope: Scope): Readiness {
  const relevant = diagnostics.filter((diagnostic) => scope === "musicXml" || !musicXmlOnlyCodes.has(diagnostic.code));
  if (relevant.some((diagnostic) => diagnostic.severity === "blocking")) return "blocked";
  if (relevant.some((diagnostic) => diagnostic.severity === "warning")) return "ready-with-warnings";
  return "ready";
}

function add(diagnostics: Diagnostic[], code: string, message: string): void {
  if (diagnostics.some((diagnostic) => diagnostic.code === code && diagnostic.message === message)) return;
  diagnostics.push({ code, severity: "blocking", message });
}
