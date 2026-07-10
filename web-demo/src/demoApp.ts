import { createAlphaTabApi, detectGpEncoding } from "@tab-viewer/web-core";
import { presentGpFile, type DemoState } from "./gpDemoPresenter";

export type DemoTargets = {
  status: HTMLElement;
  summary: HTMLElement;
};

export function mountDemoApp(ownerDocument: Document): void {
  const fileInput = ownerDocument.querySelector<HTMLInputElement>("#score-file");
  const alphaTabHost = ownerDocument.querySelector<HTMLElement>("#alpha-tab");
  const status = ownerDocument.querySelector<HTMLElement>("#status");
  const summary = ownerDocument.querySelector<HTMLElement>("#summary");

  if (!fileInput || !alphaTabHost || !status || !summary) {
    throw new Error("Demo DOM is missing required elements");
  }

  const chineseSerifFonts =
    "Georgia, 'Songti SC', 'STSong', SimSun, 'Noto Serif SC', serif";
  const chineseSansFonts =
    "Arial, 'PingFang SC', 'Microsoft YaHei', 'Heiti SC', 'Noto Sans SC', sans-serif";

  const api = createAlphaTabApi(alphaTabHost, {
    core: {
      useWorkers: false,
      scriptFile: "/alphatab/alphaTab.mjs",
      fontDirectory: "/alphatab/font/",
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
  });

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) {
      renderDemoState({ status, summary }, { status: "idle", message: "等待选择文件" });
      return;
    }

    renderDemoState({ status, summary }, { status: "loading", message: "正在加载文件" });
    void file.arrayBuffer().then(buffer => {
      const bytes = new Uint8Array(buffer);
      const encoding = detectGpEncoding(bytes);
      if (api.settings?.importer) {
        api.settings.importer.encoding = encoding;
        api.updateSettings?.();
      }
      return presentGpFile({ file, api });
    })
      .then(state => renderDemoState({ status, summary }, state))
      .catch(error => {
        renderDemoState(
          {
            status,
            summary,
          },
          {
            status: "error",
            message: error instanceof Error ? error.message : "加载失败",
          },
        );
      });
  });
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
