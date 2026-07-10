import * as alphaTab from "@coderline/alphatab";

export type AlphaTabScoreLike = {
  title?: string;
  artist?: string;
  tracks?: Array<{ name?: string }>;
  masterBars?: unknown[];
  tempo?: number;
};

export type GpScoreSummary = {
  title: string;
  artist?: string;
  trackCount: number;
  masterBarCount: number;
  tempo?: number;
};

export type AlphaTabScoreLoader = (bytes: Uint8Array) => AlphaTabScoreLike;

const GP_BINARY_HEADER = "FICHIER GUITAR PRO";
const ZIP_MAGIC = new Uint8Array([0x50, 0x4b]);

export function detectGpEncoding(bytes: Uint8Array): string {
  if (startsWithBytes(bytes, ZIP_MAGIC)) {
    return "utf-8";
  }
  const header = readAsciiBytes(bytes, 0, Math.min(bytes.length, 30));
  if (header.startsWith(GP_BINARY_HEADER)) {
    return "gbk";
  }
  return "utf-8";
}

function startsWithBytes(bytes: Uint8Array, prefix: Uint8Array): boolean {
  if (bytes.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (bytes[i] !== prefix[i]) return false;
  }
  return true;
}

function readAsciiBytes(bytes: Uint8Array, offset: number, length: number): string {
  let result = "";
  for (let i = 0; i < length && offset + i < bytes.length; i++) {
    const byte = bytes[offset + i];
    if (byte === undefined) break;
    result += String.fromCharCode(byte);
  }
  return result;
}

export function loadGpScore(bytes: Uint8Array, loader: AlphaTabScoreLoader = defaultAlphaTabLoader): AlphaTabScoreLike {
  return loader(bytes);
}

export function summarizeGpScore(score: AlphaTabScoreLike): GpScoreSummary {
  const summary: GpScoreSummary = {
    title: score.title && score.title.length > 0 ? score.title : "Untitled",
    trackCount: score.tracks?.length ?? 0,
    masterBarCount: score.masterBars?.length ?? 0,
  };

  if (score.artist && score.artist.length > 0) {
    summary.artist = score.artist;
  }
  if (score.tempo !== undefined) {
    summary.tempo = score.tempo;
  }

  return summary;
}

function defaultAlphaTabLoader(bytes: Uint8Array): AlphaTabScoreLike {
  const settings = new alphaTab.Settings();
  return alphaTab.importer.ScoreLoader.loadScoreFromBytes(bytes, settings) as AlphaTabScoreLike;
}
