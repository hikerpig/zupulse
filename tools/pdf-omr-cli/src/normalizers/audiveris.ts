import { PdfOmrError } from "../errors";
import { omrScoreDraftSchema, type OmrScoreDraft } from "../schemas";
import {
  childElement,
  childElements,
  childText,
  integerText,
  parseMusicXmlDocument,
  type XmlElement,
} from "./musicxml-source";

type Rational = { numerator: number; denominator: number };
type Diagnostic = OmrScoreDraft["diagnostics"][number];
type Event = OmrScoreDraft["parts"][number]["staves"][number]["measures"][number]["voices"][number]["events"][number];

export function normalizeAudiverisMusicXml(bytes: Uint8Array): OmrScoreDraft {
  try {
    const document = parseMusicXmlDocument(bytes);
    const root = document.documentElement;
    if (root === null) throw new Error("document-element-required");
    if (root.nodeName !== "score-partwise") throw new Error("score-partwise-required");
    const names = readPartNames(root);
    const diagnostics: Diagnostic[] = [];
    const parts = childElements(root, "part").map((part) => normalizePart(part, names, diagnostics));
    return omrScoreDraftSchema.parse({ schemaVersion: "1.0.0", parts, diagnostics });
  } catch (error) {
    if (error instanceof PdfOmrError) throw error;
    throw new PdfOmrError("ENGINE_OUTPUT_INVALID", "Audiveris MusicXML cannot be normalized", {
      context: { reason: "normalization-failed" },
      cause: error,
    });
  }
}

function normalizePart(part: XmlElement, names: ReadonlyMap<string, string>, diagnostics: Diagnostic[]) {
  const id = part.getAttribute("id") ?? "";
  const name = names.get(id) ?? id;
  let divisions: number | undefined;
  let timeSignature: { numerator: number; denominator: number } | undefined;
  let keySignature: { fifths: number } | undefined;
  const clefs = new Map<number, { sign: "G" | "F" | "C" | "percussion" | "TAB" | "none"; line?: number }>();
  let staffCount = 1;
  const normalizedMeasures: Array<
    Array<{
      index: number;
      timeSignature?: { numerator: number; denominator: number };
      duration?: Rational;
      keySignature?: { fifths: number };
      clef?: { sign: "G" | "F" | "C" | "percussion" | "TAB" | "none"; line?: number };
      repeat?: { forward: boolean; backward: boolean };
      voices: Array<{ index: number; events: Event[] }>;
    }>
  > = [];

  childElements(part, "measure").forEach((measure, measureIndex) => {
    const attributes = childElement(measure, "attributes");
    if (attributes !== undefined) {
      const nextDivisions = integerText(attributes, "divisions");
      if (nextDivisions !== undefined && nextDivisions > 0) divisions = nextDivisions;
      const time = childElement(attributes, "time");
      const beats = time === undefined ? undefined : integerText(time, "beats");
      const beatType = time === undefined ? undefined : integerText(time, "beat-type");
      if (beats !== undefined && beats > 0 && beatType !== undefined && beatType > 0) {
        timeSignature = { numerator: beats, denominator: beatType };
      }
      const fifths = childElement(attributes, "key");
      const fifthCount = fifths === undefined ? undefined : integerText(fifths, "fifths");
      if (fifthCount !== undefined && fifthCount >= -7 && fifthCount <= 7) keySignature = { fifths: fifthCount };
      staffCount = Math.max(staffCount, integerText(attributes, "staves") ?? 1);
      for (const clef of childElements(attributes, "clef")) {
        const staffIndex = positiveInteger(clef.getAttribute("number")) ?? 1;
        const sign = childText(clef, "sign");
        const line = integerText(clef, "line");
        if (isClefSign(sign)) {
          clefs.set(staffIndex - 1, { sign, ...(line === undefined ? {} : { line }) });
        }
      }
    }
    if (divisions === undefined) addDiagnostic(diagnostics, "MISSING_DIVISIONS", measureIndex);
    if (timeSignature === undefined) addDiagnostic(diagnostics, "MISSING_TIME_SIGNATURE", measureIndex);

    const eventsByStaffVoice = new Map<string, Event[]>();
    const eventIndexes = new Map<string, number>();
    const lastOnsets = new Map<string, Rational>();
    let cursorUnits = 0;
    for (const item of childElements(measure)) {
      if (item.nodeName === "backup" || item.nodeName === "forward") {
        const amount = integerText(item, "duration");
        if (amount !== undefined) cursorUnits += item.nodeName === "backup" ? -amount : amount;
        continue;
      }
      if (item.nodeName !== "note") continue;
      const voice = integerText(item, "voice");
      const staff = integerText(item, "staff") ?? 1;
      const durationUnits = integerText(item, "duration");
      const hasPitch = childElement(item, "pitch") !== undefined || childElement(item, "rest") !== undefined;
      if (!hasPitch) addDiagnostic(diagnostics, "MISSING_PITCH", measureIndex);
      if (voice === undefined || voice <= 0 || durationUnits === undefined || durationUnits <= 0) {
        addDiagnostic(diagnostics, "MISSING_EVENT_TIMING", measureIndex);
        continue;
      }
      staffCount = Math.max(staffCount, staff);
      const key = `${staff - 1}:${voice}`;
      const chord = childElement(item, "chord") !== undefined;
      const duration = divisions === undefined ? undefined : rational(durationUnits, divisions * 4);
      if (duration === undefined) continue;
      const onset = chord
        ? (lastOnsets.get(key) ?? rational(cursorUnits, divisions! * 4))
        : rational(cursorUnits, divisions! * 4);
      const eventIndex = eventIndexes.get(key) ?? 0;
      const base = {
        id: `${id}-m${measureIndex}-s${staff - 1}-v${voice}-e${eventIndex}`,
        onset,
        duration,
      };
      let event: Event;
      if (childElement(item, "rest") !== undefined) {
        event = { type: "rest", ...base };
      } else {
        const pitch = childElement(item, "pitch");
        const step = pitch === undefined ? undefined : childText(pitch, "step");
        const octave = pitch === undefined ? undefined : integerText(pitch, "octave");
        const alter = pitch === undefined ? 0 : (integerText(pitch, "alter") ?? 0);
        const writtenPitch = isPitchStep(step) && octave !== undefined ? { step, alter, octave } : undefined;
        if (writtenPitch === undefined) addDiagnostic(diagnostics, "MISSING_PITCH", measureIndex);
        const tieTypes = childElements(item, "tie").map((tie) => tie.getAttribute("type"));
        const tie =
          tieTypes.includes("start") && tieTypes.includes("stop")
            ? "continue"
            : tieTypes.includes("start")
              ? "start"
              : tieTypes.includes("stop")
                ? "end"
                : undefined;
        const modification = childElement(item, "time-modification");
        const actualNotes = modification === undefined ? undefined : integerText(modification, "actual-notes");
        const normalNotes = modification === undefined ? undefined : integerText(modification, "normal-notes");
        const tuplet =
          actualNotes !== undefined && actualNotes > 0 && normalNotes !== undefined && normalNotes > 0
            ? { actualNotes, normalNotes }
            : undefined;
        event = {
          type: "note",
          ...base,
          ...(writtenPitch === undefined
            ? {}
            : { writtenPitch, soundingMidi: midi(writtenPitch.step, writtenPitch.alter, writtenPitch.octave) }),
          ...(tie === undefined ? {} : { tie }),
          ...(tuplet === undefined ? {} : { tuplet }),
        };
      }
      const events = eventsByStaffVoice.get(key) ?? [];
      events.push(event);
      eventsByStaffVoice.set(key, events);
      eventIndexes.set(key, eventIndex + 1);
      lastOnsets.set(key, onset);
      if (!chord) cursorUnits += durationUnits;
    }

    const forward = childElements(measure, "barline").some(
      (barline) => childElement(barline, "repeat")?.getAttribute("direction") === "forward",
    );
    const backward = childElements(measure, "barline").some(
      (barline) => childElement(barline, "repeat")?.getAttribute("direction") === "backward",
    );
    const perStaff = Array.from({ length: staffCount }, (_, staffIndex) => ({
      index: measureIndex,
      ...(timeSignature === undefined ? {} : { timeSignature }),
      ...(timeSignature === undefined
        ? {}
        : { duration: rational(timeSignature.numerator, timeSignature.denominator) }),
      ...(keySignature === undefined ? {} : { keySignature }),
      ...(clefs.get(staffIndex) === undefined ? {} : { clef: clefs.get(staffIndex)! }),
      ...(forward || backward ? { repeat: { forward, backward } } : {}),
      voices: [...eventsByStaffVoice.entries()]
        .filter(([key]) => key.startsWith(`${staffIndex}:`))
        .map(([key, events]) => ({ index: Number(key.split(":")[1]), events }))
        .sort((left, right) => left.index - right.index),
    }));
    normalizedMeasures.push(perStaff);
  });

  const staves = Array.from({ length: staffCount }, (_, staffIndex) => ({
    index: staffIndex,
    measures: normalizedMeasures.map((measure) => measure[staffIndex]!).filter(Boolean),
  }));
  return { id, name: name.length > 0 ? name : id, staves };
}

function readPartNames(root: XmlElement): Map<string, string> {
  const names = new Map<string, string>();
  const partList = childElement(root, "part-list");
  if (partList === undefined) return names;
  for (const scorePart of childElements(partList, "score-part")) {
    const id = scorePart.getAttribute("id");
    const name = childText(scorePart, "part-name");
    if (id !== null && name !== undefined) names.set(id, name);
  }
  return names;
}

function rational(numerator: number, denominator: number): Rational {
  const divisor = gcd(Math.abs(numerator), denominator);
  return { numerator: numerator / divisor, denominator: denominator / divisor };
}

function gcd(left: number, right: number): number {
  while (right !== 0) [left, right] = [right, left % right];
  return left || 1;
}

function positiveInteger(value: string | null): number | undefined {
  if (value === null || !/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function midi(step: "A" | "B" | "C" | "D" | "E" | "F" | "G", alter: number, octave: number): number {
  const semitone = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[step];
  return (octave + 1) * 12 + semitone + alter;
}

function isPitchStep(value: string | undefined): value is "A" | "B" | "C" | "D" | "E" | "F" | "G" {
  return value !== undefined && ["A", "B", "C", "D", "E", "F", "G"].includes(value);
}

function isClefSign(value: string | undefined): value is "G" | "F" | "C" | "percussion" | "TAB" | "none" {
  return value !== undefined && ["G", "F", "C", "percussion", "TAB", "none"].includes(value);
}

function addDiagnostic(diagnostics: Diagnostic[], code: string, measureIndex: number): void {
  const message = `${code.toLowerCase().replaceAll("_", " ")} at measure ${measureIndex}`;
  if (diagnostics.some((diagnostic) => diagnostic.code === code && diagnostic.message === message)) return;
  diagnostics.push({
    code,
    severity: "blocking",
    message,
  });
}
