import { ImportPreflightError } from "../import/diagnostics";

export const MUSICXML_LIMITS = {
  maxXmlBytes: 32 * 1024 * 1024,
  maxEntries: 256,
  maxEntryBytes: 32 * 1024 * 1024,
  maxTotalUncompressedBytes: 64 * 1024 * 1024,
  maxParts: 256,
  maxMeasures: 100_000,
  maxNotes: 1_000_000,
} as const;

export type MusicXmlPreflight = {
  root: "score-partwise" | "score-timewise";
  version?: string;
  partCount: number;
  measureCount: number;
  noteCount: number;
  highRiskFeatures: string[];
};

export function preflightMusicXml(bytes: Uint8Array): MusicXmlPreflight {
  if (bytes.byteLength > MUSICXML_LIMITS.maxXmlBytes) fail("resource-limit-exceeded");
  const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
  const doctype = /<!DOCTYPE\b[\s\S]*?>/i.exec(source)?.[0];
  if (doctype && /\b(?:SYSTEM|PUBLIC)\b/i.test(doctype) && !isStandardMusicXmlDoctype(doctype))
    fail("unsupported-format");
  const withoutProlog = source.replace(/^\s*(?:<\?xml[\s\S]*?\?>\s*)?(?:<!DOCTYPE[\s\S]*?>\s*)?/, "");
  const rootMatch = /^<(score-partwise|score-timewise)\b([^>]*)>/i.exec(withoutProlog);
  if (!rootMatch) {
    if (/^<opus\b/i.test(withoutProlog)) fail("unsupported-format");
    fail("unsupported-format");
  }
  const root = rootMatch[1]!.toLowerCase() as MusicXmlPreflight["root"];
  if (
    !new RegExp(`<\\/${root}\\s*>\\s*$`, "i").test(withoutProlog) &&
    !new RegExp(`^<${root}\\b[^>]*/>\\s*$`, "i").test(withoutProlog)
  ) {
    fail("malformed-score");
  }
  const partCount = count(source, root === "score-partwise" ? /<part\b/gi : /<score-part\b/gi);
  const measureCount = count(source, /<measure\b/gi);
  const noteCount = count(source, /<note\b/gi);
  if (
    partCount > MUSICXML_LIMITS.maxParts ||
    measureCount > MUSICXML_LIMITS.maxMeasures ||
    noteCount > MUSICXML_LIMITS.maxNotes
  ) {
    fail("resource-limit-exceeded");
  }
  const version = /\bversion\s*=\s*["']([^"']+)["']/i.exec(rootMatch[2] ?? "")?.[1];
  const highRiskFeatures = ["opus", "forward", "backup"].filter((tag) => new RegExp(`<${tag}\\b`, "i").test(source));
  return { root, ...(version ? { version } : {}), partCount, measureCount, noteCount, highRiskFeatures };
}

export type MxlEntry = { name: string; uncompressedSize: number; bytes?: Uint8Array };
export type MxlLimits = { maxEntries?: number; maxEntryBytes?: number; maxTotalUncompressedBytes?: number };

export function preflightMxlEntries(
  entries: MxlEntry[],
  limits: MxlLimits = {},
): { rootFileName: string; rootBytes: Uint8Array } {
  const maxEntries = limits.maxEntries ?? MUSICXML_LIMITS.maxEntries;
  const maxEntryBytes = limits.maxEntryBytes ?? MUSICXML_LIMITS.maxEntryBytes;
  const maxTotal = limits.maxTotalUncompressedBytes ?? MUSICXML_LIMITS.maxTotalUncompressedBytes;
  if (
    entries.length > maxEntries ||
    entries.some((entry) => entry.uncompressedSize > maxEntryBytes) ||
    entries.reduce((sum, entry) => sum + entry.uncompressedSize, 0) > maxTotal
  )
    fail("resource-limit-exceeded");
  const container = entries.find((entry) => normalize(entry.name) === "META-INF/container.xml");
  if (!container?.bytes) fail("mxl-container-missing");
  const containerXml = new TextDecoder().decode(container.bytes);
  const rootFileName = /<rootfile\b[^>]*\bfull-path\s*=\s*["']([^"']+)["']/i.exec(containerXml)?.[1];
  if (!rootFileName || rootFileName.startsWith("/") || rootFileName.split("/").includes(".."))
    fail("mxl-rootfile-missing");
  const root = entries.find((entry) => normalize(entry.name) === normalize(rootFileName));
  if (!root?.bytes) fail("mxl-rootfile-missing");
  preflightMusicXml(root.bytes);
  return { rootFileName, rootBytes: root.bytes };
}

function normalize(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "");
}
function isStandardMusicXmlDoctype(doctype: string): boolean {
  if (doctype.includes("[")) return false;
  const match =
    /^<!DOCTYPE\s+(score-(partwise|timewise))\s+PUBLIC\s+["']-\/\/Recordare\/\/DTD MusicXML [^"']+ (Partwise|Timewise)\/\/EN["']\s+["']https?:\/\/(?:www\.)?musicxml\.org\/dtds\/(partwise|timewise)\.dtd["']\s*>$/i.exec(
      doctype,
    );
  return match !== null && match[2]?.toLowerCase() === match[3]?.toLowerCase() && match[2]?.toLowerCase() === match[4];
}
function count(source: string, pattern: RegExp): number {
  return source.match(pattern)?.length ?? 0;
}
function fail(code: ConstructorParameters<typeof ImportPreflightError>[0]): never {
  throw new ImportPreflightError(code, code);
}
