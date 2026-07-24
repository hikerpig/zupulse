// Shared GP file presentation.
import {
  createScoreIdentity,
  detectGpEncoding,
  detectScoreFormat,
  loadAlphaTabBytes,
  loadGpScore,
  summarizeGpScore,
  type AlphaTabApiLike,
  type AlphaTabScoreLoader,
  type GpScoreSummary,
  type AlphaTabScoreLike,
  type ScoreIdentity,
  type ImportDiagnosticCode,
} from "@zupulse/web-core";

export type DemoStatus = "idle" | "loading" | "ready" | "error";
export type DemoIssueCode = ImportDiagnosticCode | "gp-file-required" | "alpha-tab-load-failed" | "viewer-load-failed";

export type DemoState = {
  status: DemoStatus;
  issueCode?: DemoIssueCode;
  identity?: ScoreIdentity;
  summary?: GpScoreSummary;
  bytes?: Uint8Array;
  score?: AlphaTabScoreLike;
};

export type DemoFileLike = {
  name: string;
  arrayBuffer(): Promise<ArrayBufferLike>;
};

export async function presentGpFile(input: {
  file: DemoFileLike;
  api: AlphaTabApiLike;
  loader?: AlphaTabScoreLoader;
}): Promise<DemoState> {
  if (detectScoreFormat(input.file.name) !== "gp") {
    return {
      status: "error",
      issueCode: "gp-file-required",
    };
  }

  const bytes = new Uint8Array(await input.file.arrayBuffer());
  if (input.api.settings?.importer) {
    input.api.settings.importer.encoding = detectGpEncoding(bytes);
    input.api.updateSettings?.();
  }
  const loaded = loadAlphaTabBytes(input.api, bytes);
  if (!loaded) {
    return {
      status: "error",
      issueCode: "alpha-tab-load-failed",
    };
  }

  const score = loadGpScore(bytes, input.loader);
  const summary = summarizeGpScore(score);
  const trackNames = (score.tracks ?? [])
    .map((track) => track.name?.trim())
    .filter((name): name is string => Boolean(name));
  const identityInput: Parameters<typeof createScoreIdentity>[0] = {
    fileName: input.file.name,
    bytes,
    title: summary.title,
    trackNames,
  };
  if (summary.artist !== undefined) {
    identityInput.artist = summary.artist;
  }
  if (summary.tempo !== undefined) {
    identityInput.tempoSummary = `${summary.tempo} bpm`;
  }
  const identity = await createScoreIdentity(identityInput);

  return {
    status: "ready",
    identity,
    summary,
    bytes,
    score,
  };
}
