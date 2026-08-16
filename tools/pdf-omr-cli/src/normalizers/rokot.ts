import { z } from "zod";
import { PdfOmrError } from "../errors";
import { addRational, compareRational, type ExactRational } from "../rational";
import { omrScoreDraftSchema, sha256Schema, type OmrScoreDraft } from "../schemas";
import { normalizeAudiverisMusicXml } from "./audiveris";
import { childElements, parseMusicXmlDocument } from "./musicxml-source";

const pixelBboxSchema = z
  .object({
    x: z.number().int().nonnegative(),
    y: z.number().int().nonnegative(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  })
  .strict();

const pdfPointBboxSchema = z
  .object({
    x: z.number().nonnegative(),
    y: z.number().nonnegative(),
    width: z.number().positive(),
    height: z.number().positive(),
  })
  .strict();

const rokotSystemSchema = z
  .object({
    pageIndex: z.number().int().nonnegative(),
    systemIndex: z.number().int().nonnegative(),
    source: z
      .object({
        staffLayout: z.enum(["single-staff", "grand-staff"]),
        staffCount: z.union([z.literal(1), z.literal(2)]),
        pixelBbox: pixelBboxSchema,
        pdfPointBbox: pdfPointBboxSchema,
        cropSha256: sha256Schema,
      })
      .strict(),
    abcUtf8: z.string().min(1),
    musicXmlUtf8: z.string().min(1),
  })
  .strict();

export const rokotSystemBundleSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    systems: z.array(rokotSystemSchema).min(1),
  })
  .strict()
  .superRefine((bundle, context) => {
    for (const [index, system] of bundle.systems.entries()) {
      if (
        (system.source.staffLayout === "single-staff" && system.source.staffCount !== 1) ||
        (system.source.staffLayout === "grand-staff" && system.source.staffCount !== 2)
      ) {
        context.addIssue({
          code: "custom",
          path: ["systems", index, "source"],
          message: "staffLayout and staffCount must agree",
        });
      }
    }
    for (let index = 1; index < bundle.systems.length; index += 1) {
      const previous = bundle.systems[index - 1]!;
      const current = bundle.systems[index]!;
      const ordered =
        current.pageIndex > previous.pageIndex ||
        (current.pageIndex === previous.pageIndex && current.systemIndex > previous.systemIndex);
      if (!ordered) {
        context.addIssue({
          code: "custom",
          path: ["systems", index],
          message: "systems must be ordered by pageIndex and systemIndex",
        });
      }
    }
  });

export type RokotSystemBundle = z.infer<typeof rokotSystemBundleSchema>;

const allowedVoices = new Set(["1", "1b", "2", "2b"]);
const leadingHeaderPatterns = [/^X:[^\r\n]+$/, /^M:[^\r\n]+$/, /^L:[^\r\n]+$/];

export function validateRokotAbc(bytes: Uint8Array): string {
  let abc: string;
  try {
    abc = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw invalidOutput("invalid-abc-utf8", error);
  }

  const lines = abc.split(/\r?\n/);
  const hasTempoHeader = /^Q:[^\r\n]+$/.test(lines[4] ?? "");
  const keyHeaderIndex = hasTempoHeader ? 5 : 4;
  if (
    lines[0] !== "%%rokot-abc 0.1" ||
    leadingHeaderPatterns.some((pattern, index) => !pattern.test(lines[index + 1] ?? "")) ||
    !/^K:[^\r\n]+$/.test(lines[keyHeaderIndex] ?? "")
  ) {
    throw invalidOutput("invalid-rokot-abc-envelope");
  }

  const contentLines = lines.slice(keyHeaderIndex + 1).filter((line) => line.length > 0);
  const structuralLines = contentLines.every(
    (line) => /^V:[^\s]+(?:\s.*)?$/.test(line) || /^\[V:[^\]]+\](?:\s.*)?$/.test(line) || /^w:[^\r\n]*$/.test(line),
  );
  const duplicateHeader = contentLines.some((line) => /^[XMLKQ]:/.test(line));
  if (!structuralLines || duplicateHeader) throw invalidOutput("invalid-rokot-abc-envelope");

  const voices = contentLines.flatMap((line) => {
    const declaration = /^V:([^\s]+)/.exec(line);
    if (declaration !== null) return [declaration[1]!];
    const inline = /^\[V:([^\]]+)\]/.exec(line);
    return inline === null ? [] : [inline[1]!];
  });
  if (voices.some((voice) => !allowedVoices.has(voice))) throw invalidOutput("unknown-rokot-voice");

  const body = contentLines
    .filter((line) => line.startsWith("[V:"))
    .map((line) => line.replace(/^\[V:[^\]]+\]\s*/, ""))
    .join("\n")
    .replace(/"[^"]*"/g, "")
    .replace(/![^!]*!/g, "")
    .replace(/\[[A-Za-z]:[^\]]*\]/g, "");
  if (!/(^|[\s|:[({])(?:[\^_=]*[A-Ga-g][,']*|[zZxX])/.test(body)) {
    throw invalidOutput("empty-rokot-abc");
  }

  return abc;
}

export function parseRokotSystemBundle(bytes: Uint8Array): RokotSystemBundle {
  let bundle: RokotSystemBundle;
  try {
    const json = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    bundle = rokotSystemBundleSchema.parse(JSON.parse(json) as unknown);
  } catch (error) {
    throw invalidOutput("invalid-rokot-system-bundle", error);
  }

  for (const system of bundle.systems) {
    validateRokotAbc(new TextEncoder().encode(system.abcUtf8));
  }
  return bundle;
}

type DraftMeasure = OmrScoreDraft["parts"][number]["staves"][number]["measures"][number];
type DraftVoice = DraftMeasure["voices"][number];
type Diagnostic = OmrScoreDraft["diagnostics"][number];
type RokotVoice = "1" | "1b" | "2" | "2b";

const voiceMapping: Readonly<Record<RokotVoice, { staffIndex: number; voiceIndex: number }>> = {
  "1": { staffIndex: 0, voiceIndex: 1 },
  "1b": { staffIndex: 0, voiceIndex: 2 },
  "2": { staffIndex: 1, voiceIndex: 1 },
  "2b": { staffIndex: 1, voiceIndex: 2 },
};

export function normalizeRokotOutput(bytes: Uint8Array): OmrScoreDraft {
  const bundle = parseRokotSystemBundle(bytes);
  const staffCount = bundle.systems[0]!.source.staffCount;
  if (bundle.systems.some((system) => system.source.staffCount !== staffCount)) {
    throw invalidOutput("inconsistent-system-staff-layout");
  }
  const diagnostics: Diagnostic[] = [];
  const measuresByStaff: DraftMeasure[][] = Array.from({ length: staffCount }, () => []);
  let globalMeasureIndex = 0;

  for (const system of bundle.systems) {
    const encodedXml = new TextEncoder().encode(system.musicXmlUtf8);
    const document = parseMusicXmlDocument(encodedXml);
    const root = document.documentElement;
    if (root === null || root.nodeName !== "score-partwise") {
      throw invalidOutput("invalid-rokot-musicxml");
    }
    const rawParts = childElements(root, "part");
    if (rawParts.every((part) => childElements(part, "measure").length === 0)) {
      throw invalidOutput("empty-rokot-musicxml");
    }

    const seen = new Set<RokotVoice>();
    const measureNumbers = new Map<RokotVoice, string[]>();
    const explicitHeaderOnly = new Map<RokotVoice, boolean[]>();
    for (const part of rawParts) {
      const voice = parsePartVoice(part.getAttribute("id"));
      if (voice === undefined) {
        addDiagnostic(diagnostics, "ROKOT_UNSUPPORTED_VOICE", "MusicXML contains an unmapped Rokot part", system);
        continue;
      }
      if (seen.has(voice)) throw invalidOutput("ambiguous-rokot-voice-mapping");
      seen.add(voice);
      const measures = childElements(part, "measure");
      measureNumbers.set(
        voice,
        measures.map((measure) => measure.getAttribute("number") ?? ""),
      );
      explicitHeaderOnly.set(
        voice,
        measures.map(
          (measure) => childElements(measure, "attributes").length > 0 && childElements(measure, "note").length === 0,
        ),
      );
      const unsupportedInnerVoice = measures
        .flatMap((measure) => childElements(measure, "note"))
        .some((note) => childElements(note, "voice")[0]?.textContent?.trim() !== "1");
      if (unsupportedInnerVoice) {
        addDiagnostic(
          diagnostics,
          "ROKOT_UNSUPPORTED_VOICE",
          `Rokot part P${voice} contains an unsupported MusicXML voice`,
          system,
        );
      }
    }

    const missingPrimaryStaff = !seen.has("1") || (staffCount === 2 && !seen.has("2"));
    const unexpectedBassStaff = staffCount === 1 && (seen.has("2") || seen.has("2b"));
    if (missingPrimaryStaff || unexpectedBassStaff) {
      addDiagnostic(
        diagnostics,
        "ROKOT_UNSUPPORTED_STAFF_TOPOLOGY",
        `Rokot system does not match the declared ${staffCount}-staff topology`,
        system,
      );
    }

    const normalized = normalizeAudiverisMusicXml(encodedXml);
    diagnostics.push(...normalized.diagnostics.map((diagnostic) => withSystemSource(diagnostic, system)));
    const parts = new Map(normalized.parts.map((part) => [part.id, part]));
    for (const [voice, mapping] of Object.entries(voiceMapping) as Array<
      [RokotVoice, (typeof voiceMapping)[RokotVoice]]
    >) {
      const part = parts.get(`P${voice}`);
      if (part !== undefined && part.staves.length !== 1) {
        addDiagnostic(
          diagnostics,
          "ROKOT_UNSUPPORTED_STAFF_TOPOLOGY",
          `Rokot part P${voice} does not contain exactly one staff`,
          system,
        );
      }
      if (mapping.voiceIndex === 2 && part !== undefined && part.staves[0]!.measures.every(isEventlessMeasure)) {
        parts.delete(`P${voice}`);
      }
    }

    const primaryCounts = Array.from(
      { length: staffCount },
      (_, staffIndex) => parts.get(staffIndex === 0 ? "P1" : "P2")?.staves[0]?.measures.length ?? 0,
    );
    const systemMeasureCount = Math.max(...primaryCounts);
    const secondaryCounts = Array.from(
      { length: staffCount },
      (_, staffIndex) => parts.get(staffIndex === 0 ? "P1b" : "P2b")?.staves[0]?.measures.length,
    ).filter((count): count is number => count !== undefined);
    if (
      primaryCounts.some((count) => count !== systemMeasureCount) ||
      secondaryCounts.some((count) => count !== systemMeasureCount)
    ) {
      addDiagnostic(
        diagnostics,
        "ROKOT_STAFF_MEASURE_COUNT_MISMATCH",
        "Rokot staff measure counts do not align within the system",
        system,
      );
    }
    if (systemMeasureCount === 0) throw invalidOutput("empty-rokot-musicxml");

    const numberedVoices = [...measureNumbers.entries()].filter(([voice]) => seen.has(voice));
    for (let localIndex = 0; localIndex < systemMeasureCount; localIndex += 1) {
      const numbers = new Set(
        numberedVoices.map(([, values]) => values[localIndex]).filter((value): value is string => value !== undefined),
      );
      if (numbers.size > 1) {
        addDiagnostic(
          diagnostics,
          "ROKOT_SYSTEM_BOUNDARY_AMBIGUOUS",
          `Rokot parts disagree on measure identity at local measure ${localIndex}`,
          system,
        );
      }
    }

    const removable = alignedHeaderOnlyMeasureIndexes(explicitHeaderOnly, systemMeasureCount, staffCount);
    for (let localIndex = 0; localIndex < systemMeasureCount; localIndex += 1) {
      const headerOnlyCount = [...explicitHeaderOnly.values()].filter((values) => values[localIndex] === true).length;
      if (headerOnlyCount > 0 && headerOnlyCount !== explicitHeaderOnly.size) {
        addDiagnostic(
          diagnostics,
          "ROKOT_SYSTEM_BOUNDARY_AMBIGUOUS",
          `Rokot header-only measure is not aligned at local measure ${localIndex}`,
          system,
        );
      }
      if (removable.has(localIndex)) continue;
      const joined = Array.from({ length: staffCount }, (_, staffIndex) =>
        joinStaffMeasure(parts, staffIndex, localIndex, globalMeasureIndex, system),
      );
      if (staffCount === 2 && compareRational(measureExtent(joined[0]!), measureExtent(joined[1]!)) !== 0) {
        addDiagnostic(
          diagnostics,
          "ROKOT_MEASURE_DURATION_MISMATCH",
          `Rokot staff durations disagree at global measure ${globalMeasureIndex}`,
          system,
        );
      }
      joined.forEach((measure, staffIndex) => measuresByStaff[staffIndex]!.push(measure));
      globalMeasureIndex += 1;
    }
  }

  if (globalMeasureIndex === 0) throw invalidOutput("empty-rokot-musicxml");
  return omrScoreDraftSchema.parse({
    schemaVersion: "1.0.0",
    parts: [
      {
        id: staffCount === 1 ? "score" : "piano",
        name: staffCount === 1 ? "Score" : "Piano",
        staves: measuresByStaff.map((measures, index) => ({ index, measures })),
      },
    ],
    diagnostics,
  });
}

function parsePartVoice(partId: string | null): RokotVoice | undefined {
  const value = partId?.replace(/^P/, "");
  return value !== undefined && value in voiceMapping ? (value as RokotVoice) : undefined;
}

function alignedHeaderOnlyMeasureIndexes(
  explicitHeaderOnly: ReadonlyMap<RokotVoice, readonly boolean[]>,
  measureCount: number,
  staffCount: 1 | 2,
): Set<number> {
  const removable = new Set<number>();
  if (!explicitHeaderOnly.has("1") || (staffCount === 2 && !explicitHeaderOnly.has("2"))) return removable;
  for (let index = 0; index < measureCount - 1; index += 1) {
    const values = [...explicitHeaderOnly.values()];
    if (values.length > 0 && values.every((headers) => headers[index] === true)) removable.add(index);
  }
  return removable;
}

function joinStaffMeasure(
  parts: ReadonlyMap<string, OmrScoreDraft["parts"][number]>,
  staffIndex: number,
  localIndex: number,
  globalIndex: number,
  system: RokotSystemBundle["systems"][number],
): DraftMeasure {
  const primaryVoice = staffIndex === 0 ? "1" : "2";
  const secondaryVoice = staffIndex === 0 ? "1b" : "2b";
  const primary = parts.get(`P${primaryVoice}`)?.staves[0]?.measures[localIndex];
  const secondary = parts.get(`P${secondaryVoice}`)?.staves[0]?.measures[localIndex];
  const basis = primary ?? secondary;
  const voices = [
    mapVoice(
      primary?.voices.find((voice) => voice.index === 1),
      1,
      globalIndex,
      staffIndex,
      system,
    ),
    mapVoice(
      secondary?.voices.find((voice) => voice.index === 1),
      2,
      globalIndex,
      staffIndex,
      system,
    ),
  ].filter((voice): voice is DraftVoice => voice !== undefined && voice.events.length > 0);
  return {
    index: globalIndex,
    ...(basis?.timeSignature === undefined ? {} : { timeSignature: basis.timeSignature }),
    ...(basis?.duration === undefined ? {} : { duration: basis.duration }),
    ...(basis?.keySignature === undefined ? {} : { keySignature: basis.keySignature }),
    ...(basis?.clef === undefined ? {} : { clef: basis.clef }),
    ...(basis?.repeat === undefined ? {} : { repeat: basis.repeat }),
    voices,
  };
}

function mapVoice(
  voice: DraftVoice | undefined,
  voiceIndex: number,
  measureIndex: number,
  staffIndex: number,
  system: RokotSystemBundle["systems"][number],
): DraftVoice | undefined {
  if (voice === undefined) return undefined;
  return {
    index: voiceIndex,
    events: voice.events.map((event, eventIndex) => ({
      ...event,
      id: `piano-m${measureIndex}-s${staffIndex}-v${voiceIndex}-e${eventIndex}`,
      source: {
        pageIndex: system.pageIndex,
        systemIndex: system.systemIndex,
        bbox: system.source.pdfPointBbox,
      },
    })),
  };
}

function isEventlessMeasure(measure: DraftMeasure): boolean {
  return measure.voices.every((voice) => voice.events.length === 0);
}

function measureExtent(measure: DraftMeasure): ExactRational {
  let maximum: ExactRational = { numerator: 0, denominator: 1 };
  for (const voice of measure.voices) {
    for (const event of voice.events) {
      const end = addRational(event.onset, event.duration);
      if (compareRational(end, maximum) > 0) maximum = end;
    }
  }
  return maximum;
}

function withSystemSource(diagnostic: Diagnostic, system: RokotSystemBundle["systems"][number]): Diagnostic {
  return {
    ...diagnostic,
    source: {
      pageIndex: system.pageIndex,
      systemIndex: system.systemIndex,
      bbox: system.source.pdfPointBbox,
    },
  };
}

function addDiagnostic(
  diagnostics: Diagnostic[],
  code: string,
  message: string,
  system: RokotSystemBundle["systems"][number],
): void {
  diagnostics.push({
    code,
    severity: "blocking",
    message,
    source: {
      pageIndex: system.pageIndex,
      systemIndex: system.systemIndex,
      bbox: system.source.pdfPointBbox,
    },
  });
}

function invalidOutput(reason: string, cause?: unknown): PdfOmrError {
  return new PdfOmrError("ENGINE_OUTPUT_INVALID", "Rokot output is invalid", {
    context: { reason },
    ...(cause === undefined ? {} : { cause }),
  });
}
