import { unzipSync, zipSync } from "fflate";
import { MUSICXML_LIMITS, preflightMusicXml, preflightMxlEntries, type MxlEntry } from "../musicxml/preflight";

export type MusicXmlHarmonyInsertion = {
  partId: string;
  measureIndex: number;
  harmonyXml: string;
};

export type MusicXmlRootSource = {
  rootFilePath: string | null;
  rootBytes: Uint8Array;
};

export type MusicXmlNotePitchReplacement = {
  partId: string;
  measureIndex: number;
  noteIndex: number;
  writtenPitch: {
    step: "A" | "B" | "C" | "D" | "E" | "F" | "G";
    alter: number;
    octave: number;
  };
};

type XmlTag = {
  end: number;
  name: string;
  start: number;
  type: "close" | "open" | "self";
  value: string;
};

export function insertMusicXmlHarmony(bytes: Uint8Array, insertions: readonly MusicXmlHarmonyInsertion[]): Uint8Array {
  if (isZip(bytes)) return insertMxlHarmony(bytes, insertions);
  const preflight = preflightMusicXml(bytes);
  if (insertions.length === 0) return bytes;

  return insertIntoXml(bytes, preflight.root, insertions);
}

/** Returns source part IDs in the order used by the MusicXML importer track projection. */
export function listMusicXmlPartIds(bytes: Uint8Array): string[] {
  const source = isZip(bytes) ? preflightMxlEntries(unzipMxlEntries(bytes)).rootBytes : bytes;
  const { root } = preflightMusicXml(source);
  const tags = readXmlTags(new TextDecoder("utf-8", { fatal: true }).decode(source));
  const parent = root === "score-partwise" ? 0 : findDirectChild(tags, 0, "part-list", () => true);
  if (parent === undefined) throw new Error("part-list-missing");
  const name = root === "score-partwise" ? "part" : "score-part";
  return findDirectChildren(tags, parent, name)
    .map((index) => attribute(tags[index]!.value, "id"))
    .filter((id): id is string => id !== undefined && id.length > 0);
}

/** Returns the effective MusicXML divisions for each measure in a part. */
export function listMusicXmlMeasureDivisions(bytes: Uint8Array, partId: string): number[] {
  const sourceBytes = isZip(bytes) ? preflightMxlEntries(unzipMxlEntries(bytes)).rootBytes : bytes;
  const { root } = preflightMusicXml(sourceBytes);
  const source = new TextDecoder("utf-8", { fatal: true }).decode(sourceBytes);
  const tags = readXmlTags(source);
  const targets =
    root === "score-partwise" ? partwiseMeasureTargets(tags, partId) : timewiseMeasureTargets(tags, partId);
  let effective = 1;
  return targets.map((target) => {
    const attributes = findDirectChild(tags, target, "attributes", () => true);
    const divisions = attributes === undefined ? undefined : findDirectChild(tags, attributes, "divisions", () => true);
    if (divisions !== undefined) effective = positiveIntegerElementValue(source, tags, divisions);
    return effective;
  });
}

/** Returns the score XML contained by a plain MusicXML or MXL file. */
export function readMusicXmlRootXml(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(readMusicXmlRootSource(bytes).rootBytes);
}

/** Returns the validated root score bytes and their MXL entry path, when present. */
export function readMusicXmlRootSource(bytes: Uint8Array): MusicXmlRootSource {
  if (!isZip(bytes)) {
    preflightMusicXml(bytes);
    return { rootFilePath: null, rootBytes: bytes };
  }
  const { rootFileName, rootBytes } = preflightMxlEntries(unzipMxlEntries(bytes));
  return { rootFilePath: rootFileName, rootBytes };
}

/** Rewrites only the validated root score while preserving the surrounding MusicXML container. */
export function rewriteMusicXmlRoot(bytes: Uint8Array, transform: (rootBytes: Uint8Array) => Uint8Array): Uint8Array {
  if (!isZip(bytes)) {
    preflightMusicXml(bytes);
    const transformed = transform(bytes);
    preflightMusicXml(transformed);
    return transformed;
  }
  const entries = unzipMxlEntries(bytes);
  const { rootFileName, rootBytes } = preflightMxlEntries(entries);
  const transformed = transform(rootBytes);
  preflightMusicXml(transformed);
  return zipSync(
    Object.fromEntries(
      entries.map((entry) => [
        entry.name,
        normalize(entry.name) === normalize(rootFileName) ? transformed : entry.bytes!,
      ]),
    ),
  );
}

/** Replaces pitches at exact part/measure/note ordinals without serializing unrelated XML. */
export function rewriteMusicXmlNotePitches(
  bytes: Uint8Array,
  replacements: readonly MusicXmlNotePitchReplacement[],
): Uint8Array {
  if (replacements.length === 0) return bytes;
  validatePitchReplacements(replacements);
  return rewriteMusicXmlRoot(bytes, (rootBytes) => {
    const source = new TextDecoder("utf-8", { fatal: true }).decode(rootBytes);
    const tags = readXmlTags(source);
    if (tags[0]?.name !== "score-partwise") throw new Error("score-partwise-required");
    const edits = replacements.flatMap((replacement) => pitchReplacementEdits(tags, replacement));
    return new TextEncoder().encode(applyTextEdits(source, edits));
  });
}

type TextEdit = { start: number; end: number; value: string };

function validatePitchReplacements(replacements: readonly MusicXmlNotePitchReplacement[]): void {
  const targets = new Set<string>();
  for (const replacement of replacements) {
    if (
      replacement.partId.length === 0 ||
      !Number.isInteger(replacement.measureIndex) ||
      replacement.measureIndex < 0 ||
      !Number.isInteger(replacement.noteIndex) ||
      replacement.noteIndex < 0 ||
      !Number.isInteger(replacement.writtenPitch.alter) ||
      replacement.writtenPitch.alter < -2 ||
      replacement.writtenPitch.alter > 2 ||
      !Number.isInteger(replacement.writtenPitch.octave) ||
      replacement.writtenPitch.octave < -1 ||
      replacement.writtenPitch.octave > 9
    ) {
      throw new Error("invalid-pitch-replacement");
    }
    const key = `${replacement.partId}:${replacement.measureIndex}:${replacement.noteIndex}`;
    if (targets.has(key)) throw new Error("conflicting-pitch-replacements");
    targets.add(key);
  }
}

function pitchReplacementEdits(tags: readonly XmlTag[], replacement: MusicXmlNotePitchReplacement): TextEdit[] {
  const part = findDirectChild(tags, 0, "part", (tag) => attribute(tag.value, "id") === replacement.partId);
  const measure =
    part === undefined ? undefined : findDirectChild(tags, part, "measure", () => true, replacement.measureIndex);
  const note =
    measure === undefined ? undefined : findDirectChild(tags, measure, "note", () => true, replacement.noteIndex);
  const pitch = note === undefined ? undefined : findDirectChild(tags, note, "pitch", () => true);
  if (pitch === undefined) throw new Error("pitch-target-not-found");
  const step = findDirectChild(tags, pitch, "step", () => true);
  const alter = findDirectChild(tags, pitch, "alter", () => true);
  const octave = findDirectChild(tags, pitch, "octave", () => true);
  if (step === undefined || octave === undefined) throw new Error("pitch-target-not-found");
  const edits = [
    elementContentEdit(tags, step, replacement.writtenPitch.step),
    elementContentEdit(tags, octave, String(replacement.writtenPitch.octave)),
  ];
  if (alter !== undefined) {
    const close = matchingClose(tags, alter);
    edits.push(
      replacement.writtenPitch.alter === 0
        ? { start: tags[alter]!.start, end: tags[close]!.end, value: "" }
        : elementContentEdit(tags, alter, String(replacement.writtenPitch.alter)),
    );
  } else if (replacement.writtenPitch.alter !== 0) {
    const stepClose = matchingClose(tags, step);
    edits.push({
      start: tags[stepClose]!.end,
      end: tags[stepClose]!.end,
      value: `<alter>${replacement.writtenPitch.alter}</alter>`,
    });
  }
  return edits;
}

function elementContentEdit(tags: readonly XmlTag[], element: number, value: string): TextEdit {
  if (tags[element]!.type !== "open") throw new Error("pitch-target-not-found");
  const close = matchingClose(tags, element);
  return { start: tags[element]!.end, end: tags[close]!.start, value };
}

function applyTextEdits(source: string, edits: readonly TextEdit[]): string {
  const ordered = [...edits].sort((left, right) => right.start - left.start || right.end - left.end);
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index - 1]!.start < ordered[index]!.end) throw new Error("conflicting-pitch-replacements");
  }
  return ordered.reduce((result, edit) => result.slice(0, edit.start) + edit.value + result.slice(edit.end), source);
}

function insertMxlHarmony(bytes: Uint8Array, insertions: readonly MusicXmlHarmonyInsertion[]): Uint8Array {
  if (insertions.length === 0) return bytes;
  return rewriteMusicXmlRoot(bytes, (rootBytes) => {
    const root = preflightMusicXml(rootBytes);
    return insertIntoXml(rootBytes, root.root, insertions);
  });
}

function insertIntoXml(
  bytes: Uint8Array,
  root: "score-partwise" | "score-timewise",
  insertions: readonly MusicXmlHarmonyInsertion[],
): Uint8Array {
  const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const tags = readXmlTags(source);
  const positions = insertions.map((insertion) => {
    validateInsertion(insertion);
    const target =
      root === "score-partwise" ? findPartwiseTarget(tags, insertion) : findTimewiseTarget(tags, insertion);
    if (!target) throw new Error("target-not-found");
    return { position: findContentStart(tags, target), harmonyXml: insertion.harmonyXml };
  });

  return new TextEncoder().encode(
    positions
      .sort((left, right) => right.position - left.position)
      .reduce(
        (result, insertion) =>
          result.slice(0, insertion.position) + insertion.harmonyXml + result.slice(insertion.position),
        source,
      ),
  );
}

function unzipMxlEntries(bytes: Uint8Array): MxlEntry[] {
  if (bytes.byteLength > MUSICXML_LIMITS.maxXmlBytes) throw new Error("resource-limit-exceeded");
  let totalSize = 0;
  const names = new Set<string>();
  const entries = unzipSync(bytes, {
    filter: (entry) => {
      totalSize += entry.originalSize;
      if (
        names.has(entry.name) ||
        entry.originalSize > MUSICXML_LIMITS.maxEntryBytes ||
        totalSize > MUSICXML_LIMITS.maxTotalUncompressedBytes ||
        names.size >= MUSICXML_LIMITS.maxEntries
      ) {
        throw new Error("resource-limit-exceeded");
      }
      names.add(entry.name);
      return true;
    },
  });
  return Object.entries(entries).map(([name, entryBytes]) => ({
    name,
    uncompressedSize: entryBytes.byteLength,
    bytes: entryBytes,
  }));
}

function isZip(bytes: Uint8Array): boolean {
  return bytes[0] === 0x50 && bytes[1] === 0x4b;
}

function normalize(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "");
}

function validateInsertion(insertion: MusicXmlHarmonyInsertion): void {
  if (!insertion.partId || !Number.isInteger(insertion.measureIndex) || insertion.measureIndex < 0) {
    throw new Error("invalid-insertion");
  }
  if (!/^<harmony\b[\s\S]*<\/harmony>$/i.test(insertion.harmonyXml)) throw new Error("invalid-harmony");
}

function findPartwiseTarget(tags: readonly XmlTag[], insertion: MusicXmlHarmonyInsertion): number | undefined {
  const part = findDirectChild(tags, 0, "part", (tag) => attribute(tag.value, "id") === insertion.partId);
  return part === undefined ? undefined : findDirectChild(tags, part, "measure", () => true, insertion.measureIndex);
}

function findTimewiseTarget(tags: readonly XmlTag[], insertion: MusicXmlHarmonyInsertion): number | undefined {
  const measure = findDirectChild(tags, 0, "measure", () => true, insertion.measureIndex);
  return measure === undefined
    ? undefined
    : findDirectChild(tags, measure, "part", (tag) => attribute(tag.value, "id") === insertion.partId);
}

function partwiseMeasureTargets(tags: readonly XmlTag[], partId: string): number[] {
  const part = findDirectChild(tags, 0, "part", (tag) => attribute(tag.value, "id") === partId);
  if (part === undefined) throw new Error("part-not-found");
  return findDirectChildren(tags, part, "measure");
}

function timewiseMeasureTargets(tags: readonly XmlTag[], partId: string): number[] {
  return findDirectChildren(tags, 0, "measure").map((measure) => {
    const part = findDirectChild(tags, measure, "part", (tag) => attribute(tag.value, "id") === partId);
    if (part === undefined) throw new Error("part-not-found");
    return part;
  });
}

function positiveIntegerElementValue(source: string, tags: readonly XmlTag[], index: number): number {
  const tag = tags[index]!;
  if (tag.type !== "open") throw new Error("invalid-divisions");
  const value = Number(source.slice(tag.end, tags[matchingClose(tags, index)]!.start).trim());
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error("invalid-divisions");
  return value;
}

function findContentStart(tags: readonly XmlTag[], parent: number): number {
  const attributes = findDirectChild(tags, parent, "attributes", () => true);
  if (attributes === undefined) return tags[parent]!.end;
  return tags[attributes]!.type === "self" ? tags[attributes]!.end : tags[matchingClose(tags, attributes)]!.end;
}

function findDirectChild(
  tags: readonly XmlTag[],
  parent: number,
  name: string,
  predicate: (tag: XmlTag) => boolean,
  occurrence = 0,
): number | undefined {
  const close = tags[parent]!.type === "self" ? parent : matchingClose(tags, parent);
  let depth = 0;
  let matched = 0;
  for (let index = parent + 1; index < close; index += 1) {
    const tag = tags[index]!;
    if (tag.type === "close") {
      depth -= 1;
      continue;
    }
    if (tag.type === "open" && depth === 0 && tag.name === name && predicate(tag)) {
      if (matched === occurrence) return index;
      matched += 1;
    }
    if (tag.type === "open") depth += 1;
  }
  return undefined;
}

function findDirectChildren(tags: readonly XmlTag[], parent: number, name: string): number[] {
  const matches: number[] = [];
  const close = tags[parent]!.type === "self" ? parent : matchingClose(tags, parent);
  let depth = 0;
  for (let index = parent + 1; index < close; index += 1) {
    const tag = tags[index]!;
    if (tag.type === "close") {
      depth -= 1;
      continue;
    }
    if (depth === 0 && tag.name === name) matches.push(index);
    if (tag.type === "open") depth += 1;
  }
  return matches;
}

function matchingClose(tags: readonly XmlTag[], open: number): number {
  let depth = 0;
  for (let index = open + 1; index < tags.length; index += 1) {
    const tag = tags[index]!;
    if (tag.name !== tags[open]!.name) continue;
    if (tag.type === "open") depth += 1;
    if (tag.type === "close") {
      if (depth === 0) return index;
      depth -= 1;
    }
  }
  throw new Error("malformed-score");
}

function readXmlTags(source: string): XmlTag[] {
  const tags: XmlTag[] = [];
  const matcher =
    /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?]]>|<\?[^]*?\?>|<![^>]*>|<\/?[A-Za-z_][\w:.-]*(?:\s+(?:[^'">]|"[^"]*"|'[^']*')*)?\s*\/?\s*>/g;
  for (const match of source.matchAll(matcher)) {
    const value = match[0]!;
    if (
      (!value.startsWith("</") && !value.startsWith("<")) ||
      value.startsWith("<!--") ||
      value.startsWith("<?") ||
      value.startsWith("<!")
    )
      continue;
    const name = /^<\/?\s*([^\s/>]+)/.exec(value)?.[1]?.toLowerCase();
    if (!name || match.index === undefined) continue;
    tags.push({
      start: match.index,
      end: match.index + value.length,
      name,
      type: value.startsWith("</") ? "close" : /\/\s*>$/.test(value) ? "self" : "open",
      value,
    });
  }
  if (tags[0]?.name !== "score-partwise" && tags[0]?.name !== "score-timewise") throw new Error("malformed-score");
  return tags;
}

function attribute(tag: string, name: string): string | undefined {
  return new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, "i").exec(tag)?.[1];
}
