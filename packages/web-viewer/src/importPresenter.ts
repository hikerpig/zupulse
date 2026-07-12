import {
  createScoreIdentity, detectGpEncoding, loadAlphaTabBytes, loadGpScore, probeScoreFormat,
  summarizeGpScore, type AlphaTabApiLike, type AlphaTabScoreLike,
} from "@tab-viewer/web-core";
import type { DemoFileLike, DemoState } from "./gpDemoPresenter";

export async function presentScoreFile(input: { file: DemoFileLike; api: AlphaTabApiLike }): Promise<DemoState> {
  const bytes = new Uint8Array(await input.file.arrayBuffer());
  const probe = await probeScoreFormat(input.file.name, bytes);
  if (probe.status !== "confirmed") return { status: "error", message: probe.diagnostic.summary };
  if (input.api.settings?.importer) {
    input.api.settings.importer.encoding = probe.format === "gp" ? detectGpEncoding(bytes) : "utf-8";
    (input.api.settings.importer as { mergePartGroupsInMusicXml?: boolean }).mergePartGroupsInMusicXml = false;
    input.api.updateSettings?.();
  }
  if (!loadAlphaTabBytes(input.api, bytes)) return { status: "error", message: "alphaTab 无法加载该文件" };
  const score = loadGpScore(bytes) as AlphaTabScoreLike;
  const summary = summarizeGpScore(score);
  const identity = await createScoreIdentity({
    fileName: input.file.name, bytes, format: probe.format, title: summary.title,
    trackNames: (score.tracks ?? []).map(track => track.name ?? "").filter(Boolean),
    ...(summary.artist ? { artist: summary.artist } : {}),
  });
  return { status: "ready", message: `已加载 ${summary.title}`, identity, summary, bytes, score };
}
