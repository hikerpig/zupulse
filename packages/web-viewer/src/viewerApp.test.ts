// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { mountViewerApp, renderViewerState } from "./viewerApp";
import { renderViewerShell } from "./viewerShell";

describe("mountViewerApp", () => {
  it("opens through the injected host and destroys the active session", async () => {
    renderViewerShell(document);
    const openScore = vi.fn(async () => ({
      fileName: "song.gp5",
      bytes: new Uint8Array([1]),
    }));
    const destroySession = vi.fn(async () => undefined);
    const app = mountViewerApp(document, {
      host: { openScore, subscribe: () => () => undefined },
      openSession: async () => ({ destroy: destroySession, pauseAndFlush: vi.fn() }),
    });

    document.querySelector<HTMLButtonElement>("#open-score")?.click();
    await vi.waitFor(() => expect(openScore).toHaveBeenCalledOnce());
    await app.destroy();
    expect(destroySession).toHaveBeenCalledOnce();
  });

  it("destroys the previous session before opening the next score", async () => {
    renderViewerShell(document);
    const files = [
      { fileName: "first.gp5", bytes: new Uint8Array([1]) },
      { fileName: "second.gp5", bytes: new Uint8Array([2]) },
    ];
    const order: string[] = [];
    let session = 0;
    const app = mountViewerApp(document, {
      host: { openScore: async () => files.shift(), subscribe: () => () => undefined },
      openSession: async () => {
        const current = ++session;
        order.push(`start-${current}`);
        return {
          pauseAndFlush: async () => undefined,
          destroy: async () => { order.push(`destroy-${current}`); },
        };
      },
    });

    await app.openScore();
    await app.openScore();
    expect(order).toEqual(["start-1", "destroy-1", "start-2"]);
  });
});

describe("renderViewerState", () => {
  it("renders ready metadata without interpreting user-provided text as HTML", () => {
    renderViewerShell(document);
    const status = document.querySelector("#status") as HTMLElement;
    const summary = document.querySelector("#summary") as HTMLElement;

    renderViewerState(status, summary, {
      status: "ready",
      message: "已加载 Song",
      summary: {
        title: "<img src=x onerror=alert(1)>",
        artist: "Artist",
        trackCount: 2,
        masterBarCount: 3,
        tempo: 120,
      },
    });

    expect(status.textContent).toBe("已加载 Song");
    expect(summary.textContent).toContain("2 tracks");
    expect(summary.querySelector("img")).toBeNull();
  });

  it("clears stale summary for an error state", () => {
    renderViewerShell(document);
    const status = document.querySelector("#status") as HTMLElement;
    const summary = document.querySelector("#summary") as HTMLElement;
    summary.textContent = "old summary";

    renderViewerState(status, summary, { status: "error", message: "请选择 Guitar Pro 文件" });

    expect(status.textContent).toBe("请选择 Guitar Pro 文件");
    expect(summary.textContent).toBe("");
  });
});
