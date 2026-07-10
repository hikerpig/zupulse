// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  createDefaultOpenSession,
  mountViewerApp,
  renderViewerState,
  type DefaultOpenSessionDependencies,
} from "./viewerApp";
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

  it("continues the queued open flow after openSession rejects", async () => {
    renderViewerShell(document);
    const openSession = vi.fn()
      .mockRejectedValueOnce(new Error("first open failed"))
      .mockResolvedValueOnce({ pauseAndFlush: vi.fn(), destroy: vi.fn() });
    const app = mountViewerApp(document, {
      host: {
        openScore: async () => ({ fileName: "song.gp5", bytes: new Uint8Array([1]) }),
        subscribe: () => () => undefined,
      },
      openSession,
    });
    const button = document.querySelector<HTMLButtonElement>("#open-score") as HTMLButtonElement;

    button.click();
    await vi.waitFor(() => expect(openSession).toHaveBeenCalledTimes(1));
    button.click();
    await vi.waitFor(() => expect(openSession).toHaveBeenCalledTimes(2));

    await app.destroy();
  });

  it("continues the queued open flow after the host rejects", async () => {
    renderViewerShell(document);
    const openScore = vi.fn()
      .mockRejectedValueOnce(new Error("picker failed"))
      .mockResolvedValueOnce({ fileName: "song.gp5", bytes: new Uint8Array([1]) });
    const openSession = vi.fn(async () => ({ pauseAndFlush: vi.fn(), destroy: vi.fn() }));
    const app = mountViewerApp(document, {
      host: { openScore, subscribe: () => () => undefined },
      openSession,
    });
    const button = document.querySelector<HTMLButtonElement>("#open-score") as HTMLButtonElement;

    button.click();
    await vi.waitFor(() => expect(openScore).toHaveBeenCalledTimes(1));
    button.click();
    await vi.waitFor(() => expect(openSession).toHaveBeenCalledOnce());

    await app.destroy();
  });

  it("clears a previous session reference before awaiting its failing destroy", async () => {
    renderViewerShell(document);
    const failure = new Error("session cleanup failed");
    const destroySession = vi.fn(async () => { throw failure; });
    const files = [
      { fileName: "first.gp5", bytes: new Uint8Array([1]) },
      { fileName: "second.gp5", bytes: new Uint8Array([2]) },
    ];
    const app = mountViewerApp(document, {
      host: { openScore: async () => files.shift(), subscribe: () => () => undefined },
      openSession: async () => ({ pauseAndFlush: vi.fn(), destroy: destroySession }),
    });
    await app.openScore();

    await expect(app.openScore()).rejects.toBe(failure);
    await app.destroy();

    expect(destroySession).toHaveBeenCalledOnce();
  });

  it("cleans the active session before propagating a queued host failure from destroy", async () => {
    renderViewerShell(document);
    const failure = new Error("host failed");
    const destroySession = vi.fn(async () => undefined);
    const openScore = vi.fn()
      .mockResolvedValueOnce({ fileName: "song.gp5", bytes: new Uint8Array([1]) })
      .mockRejectedValueOnce(failure);
    const app = mountViewerApp(document, {
      host: { openScore, subscribe: () => () => undefined },
      openSession: async () => ({ pauseAndFlush: vi.fn(), destroy: destroySession }),
    });
    await app.openScore();

    document.querySelector<HTMLButtonElement>("#open-score")?.click();
    await vi.waitFor(() => expect(openScore).toHaveBeenCalledTimes(2));

    await expect(app.destroy()).rejects.toBe(failure);
    expect(destroySession).toHaveBeenCalledOnce();
    await expect(app.destroy()).rejects.toBe(failure);
    expect(destroySession).toHaveBeenCalledOnce();
  });
});

describe("createDefaultOpenSession cleanup", () => {
  it.each(["initialize", "mount-controls"] as const)(
    "destroys the controller when %s fails",
    async failurePoint => {
      renderViewerShell(document);
      const adapterDestroy = vi.fn();
      const controllerDestroy = vi.fn(async () => undefined);
      const failure = new Error(`${failurePoint} failed`);
      const dependencies: DefaultOpenSessionDependencies = {
        createApi: () => ({}),
        createAdapter: () => ({ destroy: adapterDestroy } as never),
        presentFile: async () => ({
          status: "ready",
          message: "已加载 Song",
          identity: { contentHash: "hash", format: "gp" },
          summary: { title: "Song", trackCount: 1, masterBarCount: 1 },
        }),
        waitForScore: async () => ({} as never),
        extractModel: () => ({
          tracks: [{ id: "track-0", sourceIndex: 0, name: "Lead" }],
          timeline: { durationTicks: 0, durationMs: 0, measures: [] },
        }),
        createController: () => ({
          initialize: failurePoint === "initialize"
            ? async () => { throw failure; }
            : async () => undefined,
          dispatch: async () => undefined,
          flush: async () => undefined,
          destroy: controllerDestroy,
        } as never),
        mountControls: () => {
          if (failurePoint === "mount-controls") throw failure;
          return () => undefined;
        },
      };
      const openSession = createDefaultOpenSession(document, {} as never, dependencies);

      await openSession({ fileName: "song.gp5", bytes: new Uint8Array([1]) });

      expect(controllerDestroy).toHaveBeenCalledOnce();
      expect(adapterDestroy).not.toHaveBeenCalled();
      expect(document.querySelector("#status")?.textContent).toBe(failure.message);
    },
  );
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
