import * as alphaTab from "@coderline/alphatab";

export type AlphaTabScoreLike = {
  title?: string;
  artist?: string;
  tracks?: unknown[];
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
