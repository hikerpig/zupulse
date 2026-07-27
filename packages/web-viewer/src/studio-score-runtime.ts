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
  type PreviewTransportState,
  type ScoreWrittenMoment,
  type ScoreWrittenRange,
} from "@zupulse/web-core";
import type { ViewerFile } from "./host";
import { presentScoreFile } from "./importPresenter";
import { attachScoreZoomCommit, createViewerAlphaTabSettings } from "./viewerApp";

export type StudioScoreRuntimeSnapshot = {
  status: "ready" | "error";
  transport: PreviewTransportState;
  audio: "loading" | "ready" | "error" | "unavailable";
  error?: string;
};

export type StudioScoreRuntime = {
  getSnapshot(): StudioScoreRuntimeSnapshot;
  subscribeTransport(listener: (transport: PreviewTransportState) => void): () => void;
  subscribeAudio?(listener: (audio: StudioScoreRuntimeSnapshot["audio"]) => void): () => void;
  subscribeSelection(listener: (moment: ScoreWrittenMoment) => void): () => void;
  subscribeErrors(listener: (error: Error) => void): () => void;
  highlight(range: ScoreWrittenRange): ReturnType<typeof highlightAlphaTabWrittenRange>;
  applyPreview(entries: readonly EffectiveHarmonyEntry[]): AlphaTabHarmonyPreviewResult;
  togglePlayback(): AlphaTabPreviewTransportResult;
  setPosition(positionTicks: number): AlphaTabPreviewTransportResult;
  setSpeed(speed: number): AlphaTabPreviewTransportResult;
  setLoop(range: ScoreWrittenRange | undefined): AlphaTabPreviewTransportResult;
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
  const initialScoreZoom = Number(host.dataset.scoreZoom) || 1;
  const api = dependencies.createApi(host, createViewerAlphaTabSettings(scrollElement, initialScoreZoom));
  const detachScoreZoom = attachScoreZoomCommit(ownerDocument, api, scrollElement);
  try {
    const result = await dependencies.presentFile({
      file: { name: file.fileName, arrayBuffer: async () => file.bytes.slice().buffer },
      api,
    });
    if (result.status !== "ready") throw new Error(result.issueCode ?? "viewer-load-failed");
    await dependencies.waitForScore(api);
  } catch (error) {
    try {
      detachScoreZoom();
      api.destroy?.();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "Studio runtime initialization and cleanup both failed");
    }
    throw error;
  }

  const studioApi = api as unknown as AlphaTabStudioApiLike;
  let restorePreview: (() => void) | undefined;
  let transport: PreviewTransportState = {
    status: "paused",
    positionTicks: studioApi.tickPosition ?? 0,
    speed: studioApi.playbackSpeed ?? 1,
  };
  let audio: StudioScoreRuntimeSnapshot["audio"] = studioApi.playPause ? "loading" : "unavailable";
  const transportListeners = new Set<(value: PreviewTransportState) => void>();
  const audioListeners = new Set<(value: StudioScoreRuntimeSnapshot["audio"]) => void>();
  const publishTransport = (next: PreviewTransportState) => {
    transport = next;
    for (const listener of transportListeners) listener(transport);
  };
  const publishAudio = (next: StudioScoreRuntimeSnapshot["audio"]) => {
    audio = next;
    for (const listener of audioListeners) listener(audio);
  };
  const detachPlayerState = studioApi.playerStateChanged?.on((state) => {
    const event = state as { state?: number; stopped?: boolean };
    const status = event.state === 1 ? "playing" : event.stopped ? "stopped" : "paused";
    publishTransport({ ...transport, status });
  });
  const detachPlayerPosition = studioApi.playerPositionChanged?.on((event) => {
    const tickPosition = (event as { tickPosition?: unknown }).tickPosition;
    if (typeof tickPosition === "number" && Number.isFinite(tickPosition))
      publishTransport({ ...transport, positionTicks: Math.max(0, tickPosition) });
  });
  const detachSoundFontLoad = studioApi.soundFontLoad?.on(() => publishAudio("loading"));
  const detachSoundFontLoaded = studioApi.soundFontLoaded?.on(() => publishAudio("ready"));
  const detachAudioError = studioApi.error?.on(() => {
    if (audio !== "ready" && audio !== "unavailable") publishAudio("error");
  });
  return {
    getSnapshot: () => ({ status: "ready", transport, audio }),
    subscribeTransport: (listener) => {
      transportListeners.add(listener);
      return () => transportListeners.delete(listener);
    },
    subscribeAudio: (listener) => {
      audioListeners.add(listener);
      return () => audioListeners.delete(listener);
    },
    subscribeSelection: (listener) => attachAlphaTabScoreSelection(studioApi, listener, host),
    subscribeErrors: (listener) => attachAlphaTabPreviewErrors(studioApi, listener),
    highlight: (range) => highlightAlphaTabWrittenRange(studioApi, range),
    applyPreview: (entries) => {
      restorePreview?.();
      restorePreview = undefined;
      const result = applyAlphaTabHarmonyPreview(studioApi, entries);
      if (result.status === "applied") restorePreview = result.restore;
      return result;
    },
    togglePlayback: () => {
      return toggleAlphaTabPreviewPlayback(studioApi);
    },
    setPosition: (positionTicks) => {
      const result = setAlphaTabPreviewPosition(studioApi, positionTicks);
      if (result.status === "positioned") publishTransport({ ...transport, positionTicks });
      return result;
    },
    setSpeed: (speed) => {
      const result = setAlphaTabPreviewSpeed(studioApi, speed);
      if (result.status === "sped") publishTransport({ ...transport, speed });
      return result;
    },
    setLoop: (range) => {
      const result = setAlphaTabPreviewLoop(studioApi, range);
      if (result.status === "looped") {
        const { loop: _loop, ...withoutLoop } = transport;
        publishTransport(
          range === undefined
            ? withoutLoop
            : {
                ...transport,
                loop: { startTicks: range.start.offsetTicks, endTicks: range.end.offsetTicks },
              },
        );
      }
      return result;
    },
    destroy: async () => {
      detachScoreZoom();
      detachPlayerState?.();
      detachPlayerPosition?.();
      detachSoundFontLoad?.();
      detachSoundFontLoaded?.();
      detachAudioError?.();
      transportListeners.clear();
      audioListeners.clear();
      restorePreview?.();
      restorePreview = undefined;
      api.destroy?.();
    },
  };
}

function required<T extends HTMLElement>(ownerDocument: Document, id: string): T {
  const element = ownerDocument.getElementById(id);
  if (!element) throw new Error(`Studio DOM is missing #${id}`);
  return element as T;
}
