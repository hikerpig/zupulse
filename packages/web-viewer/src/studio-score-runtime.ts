import {
  applyAlphaTabHarmonyPreview,
  attachAlphaTabPreviewErrors,
  attachAlphaTabScoreSelection,
  highlightAlphaTabWrittenRange,
  setAlphaTabPreviewLoop,
  setAlphaTabPreviewPosition,
  setAlphaTabPreviewSpeed,
  toggleAlphaTabPreviewPlayback,
  createAlphaTabApi,
  waitForAlphaTabScore,
  type AlphaTabApiLike,
  type AlphaTabHarmonyPreviewResult,
  type AlphaTabPreviewTransportResult,
  type AlphaTabStudioApiLike,
  type EffectiveHarmonyEntry,
  type ScoreWrittenMoment,
  type ScoreWrittenRange,
} from "@zupulse/web-core";
import type { ViewerFile } from "./host";
import { presentScoreFile } from "./importPresenter";
import { createViewerAlphaTabSettings } from "./viewerApp";

export type StudioScoreRuntimeSnapshot = { status: "ready" | "error"; error?: string };

export type StudioScoreRuntime = {
  getSnapshot(): StudioScoreRuntimeSnapshot;
  subscribeSelection(listener: (moment: ScoreWrittenMoment) => void): () => void;
  subscribeErrors(listener: (error: Error) => void): () => void;
  highlight(range: ScoreWrittenRange): ReturnType<typeof highlightAlphaTabWrittenRange>;
  applyPreview(entries: readonly EffectiveHarmonyEntry[]): AlphaTabHarmonyPreviewResult;
  togglePlayback(): AlphaTabPreviewTransportResult;
  setPosition(positionTicks: number): AlphaTabPreviewTransportResult;
  setSpeed(speed: number): AlphaTabPreviewTransportResult;
  setLoop(range: ScoreWrittenRange): AlphaTabPreviewTransportResult;
  destroy(): Promise<void>;
};

export type StudioScoreRuntimeDependencies = {
  createApi: typeof createAlphaTabApi;
  presentFile: typeof presentScoreFile;
  waitForScore: typeof waitForAlphaTabScore;
};

const defaultDependencies: StudioScoreRuntimeDependencies = {
  createApi: createAlphaTabApi,
  presentFile: presentScoreFile,
  waitForScore: waitForAlphaTabScore,
};

export async function createStudioScoreRuntime(
  ownerDocument: Document,
  file: ViewerFile,
  dependencies: StudioScoreRuntimeDependencies = defaultDependencies,
): Promise<StudioScoreRuntime> {
  const host = required(ownerDocument, "alpha-tab");
  const scrollElement = host.parentElement;
  if (!scrollElement) throw new Error("Studio DOM is missing the score scroll container");
  host.replaceChildren();
  const api = dependencies.createApi(host, createViewerAlphaTabSettings(scrollElement));
  try {
    const result = await dependencies.presentFile({
      file: { name: file.fileName, arrayBuffer: async () => file.bytes.slice().buffer },
      api,
    });
    if (result.status !== "ready") throw new Error(result.message);
    await dependencies.waitForScore(api);
  } catch (error) {
    try {
      api.destroy?.();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "Studio runtime initialization and cleanup both failed");
    }
    throw error;
  }

  const studioApi = api as unknown as AlphaTabStudioApiLike;
  return {
    getSnapshot: () => ({ status: "ready" }),
    subscribeSelection: (listener) => attachAlphaTabScoreSelection(studioApi, listener),
    subscribeErrors: (listener) => attachAlphaTabPreviewErrors(studioApi, listener),
    highlight: (range) => highlightAlphaTabWrittenRange(studioApi, range),
    applyPreview: (entries) => applyAlphaTabHarmonyPreview(studioApi, entries),
    togglePlayback: () => toggleAlphaTabPreviewPlayback(studioApi),
    setPosition: (positionTicks) => setAlphaTabPreviewPosition(studioApi, positionTicks),
    setSpeed: (speed) => setAlphaTabPreviewSpeed(studioApi, speed),
    setLoop: (range) => setAlphaTabPreviewLoop(studioApi, range),
    destroy: async () => {
      api.destroy?.();
    },
  };
}

function required<T extends HTMLElement>(ownerDocument: Document, id: string): T {
  const element = ownerDocument.getElementById(id);
  if (!element) throw new Error(`Studio DOM is missing #${id}`);
  return element as T;
}
