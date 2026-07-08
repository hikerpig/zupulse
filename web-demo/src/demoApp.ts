import { createAlphaTabApi } from "@tab-viewer/web-core";
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

  const api = createAlphaTabApi(alphaTabHost, {
    display: {
      scale: 1,
    },
  });

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) {
      renderDemoState({ status, summary }, { status: "idle", message: "等待选择文件" });
      return;
    }

    renderDemoState({ status, summary }, { status: "loading", message: "正在加载文件" });
    void presentGpFile({ file, api })
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
