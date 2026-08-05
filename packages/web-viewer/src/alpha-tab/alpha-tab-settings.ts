import type { AlphaTabApiLike } from "@zupulse/web-core";
import { ALPHATAB_ASSETS } from "../playbackAssets";
import {
  SCORE_LAYOUT_COMMIT_EVENT,
  SCORE_ZOOM_COMMIT_EVENT,
  type ScoreLayoutCommitDetail,
  type ScoreZoomCommitDetail,
} from "../scoreZoom";
import { readAlphaTabStaffSystems } from "../score-navigation/alpha-tab-navigation";

export function createViewerAlphaTabSettings(scrollElement: HTMLElement, scoreZoom = 1): unknown {
  const chineseSerifFonts = "Georgia, 'Songti SC', 'STSong', SimSun, 'Noto Serif SC', serif";
  const chineseSansFonts = "Arial, 'PingFang SC', 'Microsoft YaHei', 'Heiti SC', 'Noto Sans SC', sans-serif";
  return {
    core: {
      useWorkers: false,
      includeNoteBounds: true,
      scriptFile: ALPHATAB_ASSETS.scriptFile,
      fontDirectory: ALPHATAB_ASSETS.fontDirectory,
    },
    player: {
      enablePlayer: true,
      enableCursor: true,
      enableAnimatedBeatCursor: true,
      enableElementHighlighting: true,
      enableUserInteraction: false,
      scrollElement,
      soundFont: ALPHATAB_ASSETS.soundFont,
    },
    display: {
      scale: scoreZoom,
      padding: [16, 16],
      stretchForce: 0.5,
      systemPaddingTop: 6,
      systemPaddingBottom: 6,
      resources: {
        secondaryGlyphColor: "#000000",
        titleFont: `28px ${chineseSerifFonts}`,
        subTitleFont: `18px ${chineseSerifFonts}`,
        wordsFont: `14px ${chineseSansFonts}`,
        tablatureFont: `12px ${chineseSansFonts}`,
        graceFont: `10px ${chineseSansFonts}`,
        barNumberFont: `10px ${chineseSansFonts}`,
        copyrightFont: `bold 11px ${chineseSansFonts}`,
        markerFont: `bold 13px ${chineseSerifFonts}`,
        directionsFont: `13px ${chineseSerifFonts}`,
        timerFont: `11px ${chineseSerifFonts}`,
        fretboardNumberFont: `10px ${chineseSansFonts}`,
        numberedNotationFont: `13px ${chineseSansFonts}`,
        numberedNotationGraceFont: `14px ${chineseSansFonts}`,
      },
    },
  };
}

export function attachScoreZoomCommit(
  ownerDocument: Document,
  api: AlphaTabApiLike,
  scrollElement: HTMLElement,
  schedule: (callback: () => void) => void = (callback) => requestAnimationFrame(callback),
): () => void {
  type PendingRestore = {
    scoreAnchor: ReturnType<typeof captureScoreAnchor>;
    scrollRatio: number;
    requestedZoom?: number;
    renderingZoom?: number;
  };

  let pendingRestore: PendingRestore | undefined;
  let detachPendingRestore: (() => void) | undefined;

  const clearPendingRestore = () => {
    detachPendingRestore?.();
    detachPendingRestore = undefined;
    pendingRestore = undefined;
  };
  const restore = () => {
    const pending = pendingRestore;
    if (!pending) return;
    if (pending.requestedZoom !== undefined && pending.renderingZoom !== pending.requestedZoom) {
      startZoomRender(pending.requestedZoom);
      return;
    }
    const nextRange = Math.max(0, scrollElement.scrollHeight - scrollElement.clientHeight);
    const anchorSystemIndex = pending.scoreAnchor?.systemIndex;
    const nextSystem =
      anchorSystemIndex === undefined
        ? undefined
        : readAlphaTabStaffSystems(api)?.find((system) => system.systemIndex === anchorSystemIndex);
    const nextScrollTop =
      nextSystem && pending.scoreAnchor
        ? nextSystem.y + pending.scoreAnchor.centerOffset - scrollElement.clientHeight / 2
        : undefined;
    scrollElement.scrollTop = Math.min(nextRange, Math.max(0, nextScrollTop ?? pending.scrollRatio * nextRange));
    clearPendingRestore();
  };
  const listenForRender = () => {
    if (detachPendingRestore) return;
    if (api.postRenderFinished) {
      detachPendingRestore = api.postRenderFinished.on(restore) ?? (() => {});
    } else {
      schedule(restore);
    }
  };
  const startZoomRender = (zoom: number) => {
    const pending = pendingRestore;
    if (!pending || !api.settings?.display) return;
    pending.renderingZoom = zoom;
    api.settings.display.scale = zoom;
    api.updateSettings?.();
    listenForRender();
    api.render?.();
  };
  const capturePendingRestore = (): PendingRestore => {
    const scoreAnchor = captureScoreAnchor(api, scrollElement);
    const scrollRange = Math.max(0, scrollElement.scrollHeight - scrollElement.clientHeight);
    const scrollRatio = scrollRange === 0 ? 0 : scrollElement.scrollTop / scrollRange;
    return { scoreAnchor, scrollRatio };
  };
  const commitZoom = (event: Event) => {
    const zoom = (event as CustomEvent<ScoreZoomCommitDetail>).detail?.zoom;
    if (!Number.isFinite(zoom) || !api.settings?.display) return;
    if (!pendingRestore) {
      pendingRestore = capturePendingRestore();
    }
    pendingRestore.requestedZoom = zoom;
    if (pendingRestore.renderingZoom === undefined) {
      startZoomRender(zoom);
    }
  };
  const commitLayout = (event: Event) => {
    const reason = (event as CustomEvent<ScoreLayoutCommitDetail>).detail?.reason;
    if (reason !== "width") return;
    clearPendingRestore();
    pendingRestore = capturePendingRestore();
    listenForRender();
  };
  ownerDocument.addEventListener(SCORE_ZOOM_COMMIT_EVENT, commitZoom);
  ownerDocument.addEventListener(SCORE_LAYOUT_COMMIT_EVENT, commitLayout);
  return () => {
    clearPendingRestore();
    ownerDocument.removeEventListener(SCORE_ZOOM_COMMIT_EVENT, commitZoom);
    ownerDocument.removeEventListener(SCORE_LAYOUT_COMMIT_EVENT, commitLayout);
  };
}

function captureScoreAnchor(
  api: AlphaTabApiLike,
  scrollElement: HTMLElement,
): { systemIndex: number; centerOffset: number } | undefined {
  const systems = readAlphaTabStaffSystems(api);
  if (!systems?.length) return undefined;
  const viewportCenter = scrollElement.scrollTop + scrollElement.clientHeight / 2;
  const system = systems.reduce((closest, candidate) =>
    Math.abs(candidate.y + candidate.height / 2 - viewportCenter) <
    Math.abs(closest.y + closest.height / 2 - viewportCenter)
      ? candidate
      : closest,
  );
  return {
    systemIndex: system.systemIndex,
    centerOffset: viewportCenter - system.y,
  };
}
