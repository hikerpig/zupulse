import {
  createScoreIdentity,
  detectScoreFormat,
  loadAlphaTabBytes,
  loadGpScore,
  summarizeGpScore,
  type AlphaTabApiLike,
  type AlphaTabScoreLoader,
  type GpScoreSummary,
  type ScoreIdentity,
} from "@tab-viewer/web-core";

export type DemoStatus = "idle" | "loading" | "ready" | "error";

export type DemoState = {
  status: DemoStatus;
  message: string;
  identity?: ScoreIdentity;
  summary?: GpScoreSummary;
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
      message: "请选择 Guitar Pro 文件",
    };
  }

  const bytes = new Uint8Array(await input.file.arrayBuffer());
  const loaded = loadAlphaTabBytes(input.api, bytes);
  if (!loaded) {
    return {
      status: "error",
      message: "alphaTab 无法加载该文件",
    };
  }

  const score = loadGpScore(bytes, input.loader);
  const summary = summarizeGpScore(score);
  const identityInput: Parameters<typeof createScoreIdentity>[0] = {
    fileName: input.file.name,
    bytes,
    title: summary.title,
    trackNames: [],
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
    message: `已加载 ${summary.title}`,
    identity,
    summary,
  };
}
