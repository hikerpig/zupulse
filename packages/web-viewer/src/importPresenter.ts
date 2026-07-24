import {
  createScoreIdentity,
  detectGpEncoding,
  loadAlphaTabBytes,
  loadGpScore,
  probeScoreFormat,
  summarizeGpScore,
  type AlphaTabApiLike,
  type AlphaTabScoreLike,
} from "@zupulse/web-core";
import type { DemoFileLike, DemoState } from "./gpDemoPresenter";

export async function presentScoreFile(input: { file: DemoFileLike; api: AlphaTabApiLike }): Promise<DemoState> {
  const bytes = new Uint8Array(await input.file.arrayBuffer());
  const probe = await probeScoreFormat(input.file.name, bytes);
  if (probe.status !== "confirmed") return { status: "error", issueCode: probe.diagnostic.code };
  if (input.api.settings?.importer) {
    input.api.settings.importer.encoding = probe.format === "gp" ? detectGpEncoding(bytes) : "utf-8";
    (input.api.settings.importer as { mergePartGroupsInMusicXml?: boolean }).mergePartGroupsInMusicXml = false;
    input.api.updateSettings?.();
  }
  if (!loadAlphaTabBytes(input.api, bytes)) return { status: "error", issueCode: "alpha-tab-load-failed" };
  const score = loadGpScore(bytes) as AlphaTabScoreLike;
  const summary = summarizeGpScore(score);
  const identity = await createScoreIdentity({
    fileName: input.file.name,
    bytes,
    format: probe.format,
    title: summary.title,
    trackNames: (score.tracks ?? []).map((track) => track.name ?? "").filter(Boolean),
    ...(summary.artist ? { artist: summary.artist } : {}),
  });
  return { status: "ready", identity, summary, bytes, score };
}
