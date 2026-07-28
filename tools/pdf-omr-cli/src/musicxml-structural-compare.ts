import { createMusicXmlAdapter } from "@zupulse/web-core";
import { normalizeAudiverisMusicXml } from "./normalizers/audiveris";
import { compareRational, normalizeRational } from "./rational";
import type { OmrScoreDraft } from "./schemas";

export type MusicXmlDifference = {
  code: string;
  path: string;
  expected?: unknown;
  actual?: unknown;
};

export type MusicXmlStructuralReport = {
  schemaVersion: "1.0.0";
  parse: boolean;
  view: boolean;
  playback: boolean;
  structural: boolean;
  differences: MusicXmlDifference[];
};

export async function compareDraftMusicXml(draft: OmrScoreDraft, bytes: Uint8Array): Promise<MusicXmlStructuralReport> {
  let parse = false;
  let view = false;
  let playback = false;
  try {
    const adapterOutput = await createMusicXmlAdapter().parse({ fileName: "score.mxl", bytes });
    parse = true;
    view = adapterOutput.capabilities.view;
    playback = adapterOutput.capabilities.playback;
  } catch {
    return {
      schemaVersion: "1.0.0",
      parse,
      view,
      playback,
      structural: false,
      differences: [{ code: "PARSE_FAILED", path: "$" }],
    };
  }

  let actual: OmrScoreDraft;
  try {
    actual = normalizeAudiverisMusicXml(bytes);
  } catch {
    return {
      schemaVersion: "1.0.0",
      parse,
      view,
      playback,
      structural: false,
      differences: [{ code: "NORMALIZATION_FAILED", path: "$" }],
    };
  }
  const differences = compareDrafts(draft, actual);
  return {
    schemaVersion: "1.0.0",
    parse,
    view,
    playback,
    structural: differences.length === 0,
    differences,
  };
}

function compareDrafts(expected: OmrScoreDraft, actual: OmrScoreDraft): MusicXmlDifference[] {
  const differences: MusicXmlDifference[] = [];
  compareValue(differences, "PART_COUNT_MISMATCH", "parts", expected.parts.length, actual.parts.length);
  for (let partIndex = 0; partIndex < Math.min(expected.parts.length, actual.parts.length); partIndex += 1) {
    const expectedPart = expected.parts[partIndex]!;
    const actualPart = actual.parts[partIndex]!;
    const partPath = `part[${partIndex}]`;
    compareValue(differences, "PART_ID_MISMATCH", `${partPath}.id`, expectedPart.id, actualPart.id);
    compareValue(
      differences,
      "STAFF_COUNT_MISMATCH",
      `${partPath}.staves`,
      expectedPart.staves.length,
      actualPart.staves.length,
    );
    for (
      let staffIndex = 0;
      staffIndex < Math.min(expectedPart.staves.length, actualPart.staves.length);
      staffIndex += 1
    ) {
      const expectedStaff = expectedPart.staves[staffIndex]!;
      const actualStaff = actualPart.staves[staffIndex]!;
      const staffPath = `${partPath}.staff[${staffIndex}]`;
      compareValue(
        differences,
        "MEASURE_COUNT_MISMATCH",
        `${staffPath}.measures`,
        expectedStaff.measures.length,
        actualStaff.measures.length,
      );
      for (
        let measureIndex = 0;
        measureIndex < Math.min(expectedStaff.measures.length, actualStaff.measures.length);
        measureIndex += 1
      ) {
        compareMeasure(
          expectedStaff.measures[measureIndex]!,
          actualStaff.measures[measureIndex]!,
          `${staffPath}.measure[${measureIndex}]`,
          differences,
        );
      }
    }
  }
  return differences;
}

function compareMeasure(
  expected: OmrScoreDraft["parts"][number]["staves"][number]["measures"][number],
  actual: OmrScoreDraft["parts"][number]["staves"][number]["measures"][number],
  path: string,
  differences: MusicXmlDifference[],
): void {
  compareValue(
    differences,
    "TIME_SIGNATURE_MISMATCH",
    `${path}.timeSignature`,
    expected.timeSignature,
    actual.timeSignature,
  );
  compareValue(
    differences,
    "MEASURE_DURATION_MISMATCH",
    `${path}.duration`,
    normalized(expected.duration),
    normalized(actual.duration),
  );
  compareValue(
    differences,
    "KEY_SIGNATURE_MISMATCH",
    `${path}.keySignature`,
    expected.keySignature,
    actual.keySignature,
  );
  compareValue(differences, "CLEF_MISMATCH", `${path}.clef`, expected.clef, actual.clef);
  compareValue(differences, "REPEAT_MISMATCH", `${path}.repeat`, expected.repeat, actual.repeat);
  compareValue(differences, "VOICE_COUNT_MISMATCH", `${path}.voices`, expected.voices.length, actual.voices.length);
  const expectedVoices = [...expected.voices].sort((left, right) => left.index - right.index);
  const actualVoices = [...actual.voices].sort((left, right) => left.index - right.index);
  for (let voiceOffset = 0; voiceOffset < Math.min(expectedVoices.length, actualVoices.length); voiceOffset += 1) {
    const expectedVoice = expectedVoices[voiceOffset]!;
    const actualVoice = actualVoices[voiceOffset]!;
    const voicePath = `${path}.voice[${expectedVoice.index}]`;
    compareValue(differences, "VOICE_MISMATCH", `${voicePath}.index`, expectedVoice.index, actualVoice.index);
    const expectedEvents = [...expectedVoice.events].sort(compareEvents);
    const actualEvents = [...actualVoice.events].sort(compareEvents);
    compareValue(
      differences,
      "EVENT_COUNT_MISMATCH",
      `${voicePath}.events`,
      expectedEvents.length,
      actualEvents.length,
    );
    for (let eventIndex = 0; eventIndex < Math.min(expectedEvents.length, actualEvents.length); eventIndex += 1) {
      compareEvent(
        expectedEvents[eventIndex]!,
        actualEvents[eventIndex]!,
        `${voicePath}.event[${eventIndex}]`,
        differences,
      );
    }
  }
}

function compareEvent(
  expected: OmrScoreDraft["parts"][number]["staves"][number]["measures"][number]["voices"][number]["events"][number],
  actual: OmrScoreDraft["parts"][number]["staves"][number]["measures"][number]["voices"][number]["events"][number],
  path: string,
  differences: MusicXmlDifference[],
): void {
  compareValue(differences, "EVENT_TYPE_MISMATCH", `${path}.type`, expected.type, actual.type);
  compareValue(differences, "ONSET_MISMATCH", `${path}.onset`, normalized(expected.onset), normalized(actual.onset));
  compareValue(
    differences,
    "DURATION_MISMATCH",
    `${path}.duration`,
    normalized(expected.duration),
    normalized(actual.duration),
  );
  if (expected.type === "note" && actual.type === "note") {
    compareValue(differences, "PITCH_MISMATCH", `${path}.writtenPitch`, expected.writtenPitch, actual.writtenPitch);
    compareValue(differences, "TIE_MISMATCH", `${path}.tie`, expected.tie, actual.tie);
    compareValue(differences, "TUPLET_MISMATCH", `${path}.tuplet`, expected.tuplet, actual.tuplet);
  }
}

function compareEvents(
  left: OmrScoreDraft["parts"][number]["staves"][number]["measures"][number]["voices"][number]["events"][number],
  right: OmrScoreDraft["parts"][number]["staves"][number]["measures"][number]["voices"][number]["events"][number],
): number {
  return (
    compareRational(left.onset, right.onset) ||
    left.type.localeCompare(right.type) ||
    eventPitch(left).localeCompare(eventPitch(right))
  );
}

function eventPitch(
  event: OmrScoreDraft["parts"][number]["staves"][number]["measures"][number]["voices"][number]["events"][number],
): string {
  return event.type === "note" && event.writtenPitch !== undefined
    ? `${event.writtenPitch.step}:${event.writtenPitch.alter}:${event.writtenPitch.octave}`
    : "";
}

function normalized(value: { numerator: number; denominator: number } | undefined): unknown {
  return value === undefined ? undefined : normalizeRational(value);
}

function compareValue(
  differences: MusicXmlDifference[],
  code: string,
  path: string,
  expected: unknown,
  actual: unknown,
): void {
  if (JSON.stringify(expected) === JSON.stringify(actual)) return;
  differences.push({
    code,
    path,
    ...(expected === undefined ? {} : { expected }),
    ...(actual === undefined ? {} : { actual }),
  });
}
