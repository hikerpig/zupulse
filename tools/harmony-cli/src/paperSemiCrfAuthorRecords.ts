import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import {
  PAPER_SEMI_CRF_FEATURE_VERSION,
  PAPER_SEMI_CRF_LABEL_MAPPING_VERSION,
  normalizePaperSemiCrfLabel,
} from "@zupulse/web-core";
import { paperSemiCrfRecordsFileSchema } from "./paperSemiCrfRecords";
import type { PaperSemiCrfRecordsFile } from "./paperSemiCrfRecords";

type PaperSemiCrfRecord = PaperSemiCrfRecordsFile["records"][number];

export async function exportPaperSemiCrfAuthorRecordsFile(options: {
  splitPath: string;
  labelsPath: string;
  outputPath: string;
  role: "train" | "tune" | "final";
  maxSegmentLength: number;
  ticksPerQuarter?: number;
  labelOrderRecordsPath?: string;
}) {
  const ticksPerQuarter = options.ticksPerQuarter ?? 480;
  const splitText = await readFile(options.splitPath, "utf8");
  const paths = nonemptyLines(splitText).map((path) => resolve(dirname(options.splitPath), path));
  const availableLabels = nonemptyLines(await readFile(options.labelsPath, "utf8"));
  if (paths.length === 0) throw new Error("author split must contain at least one song");
  const records = await Promise.all(
    paths.map(async (path) =>
      parsePaperSemiCrfAuthorSong(await readFile(path, "utf8"), {
        id: basename(path).replace(/_annotated_events\.xml$/, ""),
        corpus: "bach-author",
        groupId: basename(options.splitPath),
        ticksPerQuarter,
      }),
    ),
  );
  const labels =
    options.labelOrderRecordsPath === undefined
      ? encounterOrderedLabels(records, availableLabels)
      : paperSemiCrfRecordsFileSchema.parse(JSON.parse(await readFile(options.labelOrderRecordsPath, "utf8"))).labels;
  const file = paperSemiCrfRecordsFileSchema.parse({
    schemaVersion: "paper-semi-crf-records-v1",
    command: "paper-semi-crf-records",
    role: options.role,
    labelMappingVersion: PAPER_SEMI_CRF_LABEL_MAPPING_VERSION,
    featureVersion: PAPER_SEMI_CRF_FEATURE_VERSION,
    labels,
    maxSegmentLength: options.maxSegmentLength,
    records,
  });
  const text = `${JSON.stringify(file, null, 2)}\n`;
  await writeFile(options.outputPath, text);
  return {
    command: "paper-semi-crf-records" as const,
    role: options.role,
    output: options.outputPath,
    sha256: createHash("sha256").update(text).digest("hex"),
    records: records.length,
    events: records.reduce((sum, record) => sum + record.events.length, 0),
    segments: records.reduce((sum, record) => sum + record.targetSegments.length, 0),
    maxSegmentLength: options.maxSegmentLength,
  };
}

export function parsePaperSemiCrfAuthorSong(
  xml: string,
  metadata: {
    id: string;
    corpus: string;
    groupId: string;
    ticksPerQuarter: number;
  },
): PaperSemiCrfRecord {
  if (!Number.isSafeInteger(metadata.ticksPerQuarter) || metadata.ticksPerQuarter <= 0) {
    throw new Error("invalid author records ticksPerQuarter");
  }
  const eventBlocks = childBlocks(requiredBlock(xml, "events"), "event");
  const events: PaperSemiCrfRecord["events"] = [];
  for (const [index, block] of eventBlocks.entries()) {
    const authorIndex = integerValue(block, "index");
    if (authorIndex !== index) throw new Error("author event indices must be contiguous");
    const onsetTick = toTicks(numberValue(block, "onset"), metadata.ticksPerQuarter);
    const durationTicks = toTicks(numberValue(block, "duration"), metadata.ticksPerQuarter);
    const endTick = onsetTick + durationTicks;
    const accent = numberValue(block, "accent");
    const noteBlocks = childBlocks(requiredBlock(block, "notes"), "note");
    const prepared = noteBlocks.map((noteBlock, noteIndex) => {
      const pitch = parsePitch(textValue(noteBlock, "pitch"));
      const heldFromPrevious = textValue(noteBlock, "fromPrevious") === "True";
      const sourceDurationTicks = toTicks(numberValue(noteBlock, "duration"), metadata.ticksPerQuarter);
      let noteOnsetTick: number;
      if (heldFromPrevious) {
        const previous = events.at(-1)?.notes.find((note) => note.soundingMidi === pitch.midi);
        if (!previous) throw new Error("held author note has no matching previous onset");
        noteOnsetTick = previous.onsetTick;
      } else {
        noteOnsetTick = toTicks(numberValue(noteBlock, "onset"), metadata.ticksPerQuarter);
      }
      return {
        id: `${metadata.id}:event-${index}:note-${noteIndex}`,
        trackId: "author-score",
        staffIndex: 0,
        voice: noteIndex,
        onset: { measureIndex: 0, offsetTicks: noteOnsetTick },
        onsetTick: noteOnsetTick,
        soundingPitchClass: pitch.pitchClass,
        durationTicks,
        sourceDurationTicks,
        heldFromPrevious,
        metricAccent: numberValue(noteBlock, "accent"),
        isBass: false,
        soundingMidi: pitch.midi,
        spelling: pitch.spelling,
      };
    });
    const bassMidi = Math.min(...prepared.map((note) => note.soundingMidi));
    const notes = prepared.map((note) => ({ ...note, isBass: note.soundingMidi === bassMidi }));
    events.push({
      index,
      range: {
        start: { measureIndex: 0, offsetTicks: onsetTick },
        end: { measureIndex: 0, offsetTicks: endTick },
      },
      startTick: onsetTick,
      endTick,
      durationTicks,
      metricAccent: accent,
      notes,
      ...(notes.length === 0 ? {} : { bassPitchClass: notes.find((note) => note.isBass)!.soundingPitchClass }),
    });
  }
  const targetSegments = childBlocks(requiredBlock(xml, "segments"), "segment").map((block) => ({
    startEvent: integerValue(block, "eventStart"),
    endEvent: integerValue(block, "eventStop"),
    label: simplifyAndNormalizeAuthorLabel(textValue(block, "chordLabel")),
  }));
  return {
    id: metadata.id,
    corpus: metadata.corpus,
    groupId: metadata.groupId,
    events,
    targetSegments,
  };
}

function parsePitch(value: string): {
  midi: number;
  pitchClass: number;
  spelling: { step: "A" | "B" | "C" | "D" | "E" | "F" | "G"; alter: -2 | -1 | 0 | 1 | 2 };
} {
  const match = /^([A-G])([#b-]{0,2})(-?\d+)$/.exec(value);
  if (!match) throw new Error(`unsupported author pitch: ${value}`);
  const step = match[1] as "A" | "B" | "C" | "D" | "E" | "F" | "G";
  const accidental = match[2]!;
  if (
    (accidental.includes("#") && (accidental.includes("-") || accidental.includes("b"))) ||
    (accidental.includes("-") && accidental.includes("b"))
  ) {
    throw new Error(`unsupported author pitch: ${value}`);
  }
  const alter = (accidental.startsWith("#") ? accidental.length : -accidental.length) as -2 | -1 | 0 | 1 | 2;
  const natural = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[step];
  const octave = Number(match[3]);
  const midi = (octave + 1) * 12 + natural + alter;
  if (!Number.isSafeInteger(midi) || midi < 0 || midi > 127) throw new Error(`unsupported author pitch: ${value}`);
  return { midi, pitchClass: mod12(midi), spelling: { step, alter } };
}

function requiredBlock(xml: string, tag: string): string {
  const matches = childBlocks(xml, tag);
  if (matches.length !== 1) throw new Error(`author XML requires exactly one <${tag}>`);
  return matches[0]!;
}

function childBlocks(xml: string, tag: string): string[] {
  return [...xml.matchAll(new RegExp(`<${tag}>\\s*([\\s\\S]*?)\\s*</${tag}>`, "g"))].map((match) => match[1]!);
}

function textValue(xml: string, tag: string): string {
  const match = new RegExp(`<${tag}>\\s*([^<]*?)\\s*</${tag}>`).exec(xml);
  if (!match) throw new Error(`author XML requires <${tag}>`);
  const value = match[1]!.trim();
  if (value.length === 0 || /[<>]/.test(value)) throw new Error(`invalid author XML <${tag}>`);
  return decodeXmlEntities(value);
}

function numberValue(xml: string, tag: string): number {
  const value = Number(textValue(xml, tag));
  if (!Number.isFinite(value)) throw new Error(`invalid author XML number <${tag}>`);
  return value;
}

function integerValue(xml: string, tag: string): number {
  const value = numberValue(xml, tag);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`invalid author XML integer <${tag}>`);
  return value;
}

function toTicks(quarterNotes: number, ticksPerQuarter: number): number {
  const ticks = quarterNotes * ticksPerQuarter;
  if (!Number.isSafeInteger(ticks) || ticks < 0) throw new Error("author duration is not representable in ticks");
  return ticks;
}

function decodeXmlEntities(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function mod12(value: number): number {
  return ((value % 12) + 12) % 12;
}

function simplifyAndNormalizeAuthorLabel(label: string): string {
  const match = /[A-G][#b]?:(maj|min|dim|aug|ger|it|fr)(4|6|7)?/.exec(label);
  return normalizePaperSemiCrfLabel(match?.[0] ?? label);
}

function nonemptyLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function encounterOrderedLabels(records: readonly PaperSemiCrfRecord[], availableLabels: readonly string[]): string[] {
  const ordered = new Set<string>();
  for (const record of records) {
    for (const segment of record.targetSegments) ordered.add(segment.label);
  }
  for (const label of availableLabels) ordered.add(label);
  return [...ordered];
}
