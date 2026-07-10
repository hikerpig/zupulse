import {
  AlphaTabPlaybackAdapter,
  BridgePlaybackPersistence,
  MockNativeBridge,
  PlaybackController,
  createAlphaTabApi,
  createDefaultSidecar,
  extractAlphaTabPlaybackModel,
  waitForAlphaTabScore,
  type AlphaTabApiLike,
  type PlaybackEngine,
  type ScoreIdentity,
} from "@tab-viewer/web-core";
import { ALPHATAB_ASSETS } from "./playbackAssets";
import { mountPlaybackControls } from "./playbackControls";
import {
  presentGpFile,
  type DemoFileLike,
  type DemoState,
} from "./gpDemoPresenter";

export type DemoTargets = {
  status: HTMLElement;
  summary: HTMLElement;
};

export type DemoPlaybackSession = {
  destroy(): Promise<void>;
};

export type DemoAppDependencies = {
  createApi(host: HTMLElement, options: unknown): AlphaTabApiLike;
  createAdapter(api: AlphaTabApiLike): PlaybackEngine;
  presentFile(input: { file: DemoFileLike; api: AlphaTabApiLike }): Promise<DemoState>;
  startPlaybackSession(input: {
    ownerDocument: Document;
    api: AlphaTabApiLike;
    adapter: PlaybackEngine;
    identity: ScoreIdentity;
  }): Promise<DemoPlaybackSession>;
};

export function mountDemoApp(
  ownerDocument: Document,
  dependencies: DemoAppDependencies = createDefaultDependencies(),
): () => Promise<void> {
  const fileInput = ownerDocument.querySelector<HTMLInputElement>("#score-file");
  const alphaTabHost = ownerDocument.querySelector<HTMLElement>("#alpha-tab");
  const status = ownerDocument.querySelector<HTMLElement>("#status");
  const summary = ownerDocument.querySelector<HTMLElement>("#summary");

  if (!fileInput || !alphaTabHost || !status || !summary) {
    throw new Error("Demo DOM is missing required elements");
  }

  const scoreHost = alphaTabHost;
  const targets = { status, summary };
  let activeSession: DemoPlaybackSession | undefined;
  let generation = 0;

  const handleFileChange = () => {
    const file = fileInput.files?.[0];
    void openFile(file);
  };
  const handlePageHide = () => {
    generation += 1;
    void destroyActiveSession();
  };

  fileInput.addEventListener("change", handleFileChange);
  window.addEventListener("pagehide", handlePageHide);

  return async () => {
    generation += 1;
    fileInput.removeEventListener("change", handleFileChange);
    window.removeEventListener("pagehide", handlePageHide);
    await destroyActiveSession();
  };

  async function openFile(file: DemoFileLike | undefined): Promise<void> {
    const requestGeneration = ++generation;
    await destroyActiveSession();
    if (requestGeneration !== generation) return;

    if (!file) {
      renderDemoState(targets, { status: "idle", message: "等待选择文件" });
      return;
    }

    renderDemoState(targets, { status: "loading", message: "正在加载文件" });
    const api = dependencies.createApi(scoreHost, alphaTabSettings());
    let adapter: PlaybackEngine | undefined = dependencies.createAdapter(api);

    try {
      const state = await dependencies.presentFile({ file, api });
      if (requestGeneration !== generation) {
        adapter.destroy();
        return;
      }
      if (state.status !== "ready" || !state.identity) {
        adapter.destroy();
        renderDemoState(targets, state);
        return;
      }

      const session = await dependencies.startPlaybackSession({
        ownerDocument,
        api,
        adapter,
        identity: state.identity,
      });
      adapter = undefined;
      if (requestGeneration !== generation) {
        await session.destroy();
        return;
      }

      activeSession = session;
      renderDemoState(targets, state);
    } catch (error) {
      adapter?.destroy();
      renderDemoState(targets, {
        status: "error",
        message: error instanceof Error ? error.message : "加载失败",
      });
    }
  }

  async function destroyActiveSession(): Promise<void> {
    const session = activeSession;
    activeSession = undefined;
    await session?.destroy();
  }
}

export function renderDemoState(targets: DemoTargets, state: DemoState): void {
  targets.status.textContent = state.message;

  if (state.status !== "ready" || !state.summary) {
    targets.summary.textContent = "";
    return;
  }

  const artist = state.summary.artist ? ` · ${state.summary.artist}` : "";
  const tempo = state.summary.tempo === undefined ? "" : ` · ${state.summary.tempo} bpm`;
  targets.summary.textContent = `${state.summary.title}${artist} · ${state.summary.trackCount} tracks · ${state.summary.masterBarCount} bars${tempo}`;
}

function createDefaultDependencies(): DemoAppDependencies {
  const persistence = new BridgePlaybackPersistence(new MockNativeBridge());
  return {
    createApi: createAlphaTabApi,
    createAdapter: api => new AlphaTabPlaybackAdapter(api, ALPHATAB_ASSETS.soundFont),
    presentFile: presentGpFile,
    async startPlaybackSession({ ownerDocument, api, adapter, identity }) {
      await waitForAlphaTabScore(api);
      const model = extractAlphaTabPlaybackModel(api);
      const controller = new PlaybackController({
        sessionId: crypto.randomUUID(),
        identity,
        engine: adapter,
        persistence,
        baseSidecar: createDefaultSidecar(identity),
        tracks: model.tracks,
        timeline: model.timeline,
      });

      try {
        await controller.initialize();
        const cleanupControls = mountPlaybackControls(ownerDocument, controller, model.timeline);
        return {
          async destroy() {
            cleanupControls();
            await controller.destroy();
          },
        };
      } catch (error) {
        await controller.destroy();
        throw error;
      }
    },
  };
}

function alphaTabSettings(): unknown {
  const chineseSerifFonts =
    "Georgia, 'Songti SC', 'STSong', SimSun, 'Noto Serif SC', serif";
  const chineseSansFonts =
    "Arial, 'PingFang SC', 'Microsoft YaHei', 'Heiti SC', 'Noto Sans SC', sans-serif";

  return {
    core: {
      useWorkers: false,
      scriptFile: ALPHATAB_ASSETS.scriptFile,
      fontDirectory: ALPHATAB_ASSETS.fontDirectory,
    },
    player: {
      enablePlayer: true,
      soundFont: ALPHATAB_ASSETS.soundFont,
    },
    display: {
      scale: 1,
      resources: {
        titleFont: `32px ${chineseSerifFonts}`,
        subTitleFont: `20px ${chineseSerifFonts}`,
        wordsFont: `15px ${chineseSansFonts}`,
        tablatureFont: `13px ${chineseSansFonts}`,
        graceFont: `11px ${chineseSansFonts}`,
        barNumberFont: `11px ${chineseSansFonts}`,
        copyrightFont: `bold 12px ${chineseSansFonts}`,
        markerFont: `bold 14px ${chineseSerifFonts}`,
        directionsFont: `14px ${chineseSerifFonts}`,
        timerFont: `12px ${chineseSerifFonts}`,
        fretboardNumberFont: `11px ${chineseSansFonts}`,
        numberedNotationFont: `14px ${chineseSansFonts}`,
        numberedNotationGraceFont: `16px ${chineseSansFonts}`,
      },
    },
  };
}
