import { preflightMusicXml } from "../musicxml/preflight";

export type MusicXmlHarmonyInsertion = {
  partId: string;
  measureIndex: number;
  harmonyXml: string;
};

type XmlTag = {
  end: number;
  name: string;
  start: number;
  type: "close" | "open" | "self";
  value: string;
};

export function insertMusicXmlHarmony(bytes: Uint8Array, insertions: readonly MusicXmlHarmonyInsertion[]): Uint8Array {
  const preflight = preflightMusicXml(bytes);
  if (insertions.length === 0) return bytes;

  const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const tags = readXmlTags(source);
  const positions = insertions.map((insertion) => {
    validateInsertion(insertion);
    const target =
      preflight.root === "score-partwise" ? findPartwiseTarget(tags, insertion) : findTimewiseTarget(tags, insertion);
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
