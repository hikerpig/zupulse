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
  it("renders the redesigned workspace shell", () => {
    renderViewerShell(document);

    expect(document.querySelector(".context-bar")).not.toBeNull();
    expect(document.querySelector(".transport-bar")).not.toBeNull();
    expect(document.querySelector(".score-stage")).not.toBeNull();
    expect(document.querySelector(".practice-panel")).not.toBeNull();
    expect(document.getElementById("open-score")?.textContent).toContain("打开 GP 文件");
    expect(document.querySelector(".empty-title")?.textContent).toBe("打开一份 Guitar Pro 乐谱开始练习");
  });

  it("forwards toggle-playback host commands to the active session", async () => {
    renderViewerShell(document);
    let hostListener: ((event: { type: "toggle-playback" }) => void) | undefined;
    const togglePlayback = vi.fn(async () => undefined);
    const app = mountViewerApp(document, {
      host: {
        openScore: async () => ({ fileName: "song.gp5", bytes: new Uint8Array([1]) }),
        subscribe: listener => {
          hostListener = listener as typeof hostListener;
          return () => undefined;
        },
      },
      openSession: async () => ({
        togglePlayback,
        pauseAndFlush: async () => undefined,
        destroy: async () => undefined,
      }),
    });
    await app.openScore();

    hostListener?.({ type: "toggle-playback" });
    await vi.waitFor(() => expect(togglePlayback).toHaveBeenCalledOnce());
  });

  it("opens through the injected host and destroys the active session", async () => {
    renderViewerShell(document);
    const openScore = vi.fn(async () => ({
      fileName: "song.gp5",
      bytes: new Uint8Array([1]),
    }));
    const destroySession = vi.fn(async () => undefined);
    const app = mountViewerApp(document, {
      host: { openScore, subscribe: () => () => undefined },
      openSession: async () => ({ destroy: destroySession, pauseAndFlush: vi.fn(), togglePlayback: vi.fn() }),
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
          togglePlayback: async () => undefined,
          pauseAndFlush: async () => undefined,
          destroy: async () => { order.push(`destroy-${current}`); },
        };
      },
    });

    await app.openScore();
    await app.openScore();
    expect(order).toEqual(["start-1", "destroy-1", "start-2"]);
  });

  it("serializes concurrent public openScore calls and retains only the latest session", async () => {
    renderViewerShell(document);
    const firstSessionGate = deferred<void>();
    const order: string[] = [];
    let session = 0;
    const hostOpen = vi.fn(async () => ({ fileName: "song.gp5", bytes: new Uint8Array([1]) }));
    const app = mountViewerApp(document, {
      host: { openScore: hostOpen, subscribe: () => () => undefined },
      openSession: async () => {
        const current = ++session;
        order.push(`start-${current}`);
        if (current === 1) await firstSessionGate.promise;
        return {
          togglePlayback: async () => undefined,
          pauseAndFlush: async () => undefined,
          destroy: async () => { order.push(`destroy-${current}`); },
        };
      },
    });

    const firstOpen = app.openScore();
    const secondOpen = app.openScore();
    await vi.waitFor(() => expect(order).toEqual(["start-1"]));
    expect(hostOpen).toHaveBeenCalledOnce();

    firstSessionGate.resolve();
    await Promise.all([firstOpen, secondOpen]);
    expect(order).toEqual(["start-1", "destroy-1", "start-2"]);

    await app.destroy();
    expect(order).toEqual(["start-1", "destroy-1", "start-2", "destroy-2"]);
  });

  it("rejects new opens after destroy starts and cleans an already accepted open", async () => {
    renderViewerShell(document);
    const sessionGate = deferred<void>();
    const destroySession = vi.fn(async () => undefined);
    const openSession = vi.fn(async () => {
      await sessionGate.promise;
      return { togglePlayback: vi.fn(), pauseAndFlush: vi.fn(), destroy: destroySession };
    });
    const app = mountViewerApp(document, {
      host: {
        openScore: async () => ({ fileName: "song.gp5", bytes: new Uint8Array([1]) }),
        subscribe: () => () => undefined,
      },
      openSession,
    });

    const acceptedOpen = app.openScore();
    await vi.waitFor(() => expect(openSession).toHaveBeenCalledOnce());
    const destroying = app.destroy();
    await expect(app.openScore()).rejects.toThrow("Viewer app is being destroyed");

    sessionGate.resolve();
    await acceptedOpen;
    await destroying;
    expect(openSession).toHaveBeenCalledOnce();
    expect(destroySession).toHaveBeenCalledOnce();
  });

  it("continues the queued open flow after openSession rejects", async () => {
    renderViewerShell(document);
    const openSession = vi.fn()
      .mockRejectedValueOnce(new Error("first open failed"))
      .mockResolvedValueOnce({ togglePlayback: vi.fn(), pauseAndFlush: vi.fn(), destroy: vi.fn() });
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
    const openSession = vi.fn(async () => ({ togglePlayback: vi.fn(), pauseAndFlush: vi.fn(), destroy: vi.fn() }));
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

  it("clears a queued UI error after a successful public open", async () => {
    renderViewerShell(document);
    const openScore = vi.fn()
      .mockRejectedValueOnce(new Error("picker failed"))
      .mockResolvedValueOnce({ fileName: "song.gp5", bytes: new Uint8Array([1]) });
    const app = mountViewerApp(document, {
      host: { openScore, subscribe: () => () => undefined },
      openSession: async () => ({ togglePlayback: vi.fn(), pauseAndFlush: vi.fn(), destroy: vi.fn() }),
    });

    document.querySelector<HTMLButtonElement>("#open-score")?.click();
    await vi.waitFor(() => expect(openScore).toHaveBeenCalledOnce());
    await app.openScore();

    await expect(app.destroy()).resolves.toBeUndefined();
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
      openSession: async () => ({ togglePlayback: vi.fn(), pauseAndFlush: vi.fn(), destroy: destroySession }),
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
      openSession: async () => ({ togglePlayback: vi.fn(), pauseAndFlush: vi.fn(), destroy: destroySession }),
    });
    await app.openScore();

    document.querySelector<HTMLButtonElement>("#open-score")?.click();
    await vi.waitFor(() => expect(openScore).toHaveBeenCalledTimes(2));

    await expect(app.destroy()).rejects.toBe(failure);
    expect(destroySession).toHaveBeenCalledOnce();
    await expect(app.destroy()).rejects.toBe(failure);
    expect(destroySession).toHaveBeenCalledOnce();
  });

  it("aggregates queued open and active cleanup failures during destroy", async () => {
    renderViewerShell(document);
    const openFailure = new Error("host failed");
    const cleanupFailure = new Error("session destroy failed");
    const openScore = vi.fn()
      .mockResolvedValueOnce({ fileName: "song.gp5", bytes: new Uint8Array([1]) })
      .mockRejectedValueOnce(openFailure);
    const app = mountViewerApp(document, {
      host: { openScore, subscribe: () => () => undefined },
      openSession: async () => ({
        togglePlayback: vi.fn(),
        pauseAndFlush: vi.fn(),
        destroy: async () => { throw cleanupFailure; },
      }),
    });
    await app.openScore();
    document.querySelector<HTMLButtonElement>("#open-score")?.click();
    await vi.waitFor(() => expect(openScore).toHaveBeenCalledTimes(2));

    const error = await rejectionOf(app.destroy()) as AggregateError;

    expect(error).toBeInstanceOf(AggregateError);
    expect(error.errors).toEqual([openFailure, cleanupFailure]);
  });
});

describe("createDefaultOpenSession cleanup", () => {
  it("pauses and flushes the active playback controller", async () => {
    renderViewerShell(document);
    const dispatch = vi.fn(async () => undefined);
    const flush = vi.fn(async () => undefined);
    const dependencies: DefaultOpenSessionDependencies = {
      createApi: () => ({}),
      createAdapter: () => ({ destroy: vi.fn() } as never),
      presentFile: async () => ({
        status: "ready",
        message: "已加载 Song",
        identity: { contentHash: "a".repeat(64), format: "gp" },
        summary: { title: "Song", trackCount: 1, masterBarCount: 1 },
      }),
      waitForScore: async () => ({} as never),
      extractModel: () => ({
        tracks: [{ id: "track-0", sourceIndex: 0, name: "Lead" }],
        timeline: { durationTicks: 0, durationMs: 0, measures: [] },
      }),
      createController: () => ({
        initialize: async () => undefined,
        dispatch,
        flush,
        destroy: async () => undefined,
      } as never),
      mountControls: () => () => undefined,
    };
    const openSession = createDefaultOpenSession(document, {} as never, dependencies);
    const session = await openSession({ fileName: "song.gp5", bytes: new Uint8Array([1]) });

    await session.pauseAndFlush();

    expect(dispatch).toHaveBeenCalledWith({ type: "pause" });
    expect(flush).toHaveBeenCalledOnce();
    expect(dispatch.mock.invocationCallOrder[0]).toBeLessThan(flush.mock.invocationCallOrder[0] ?? 0);
  });

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
          identity: { contentHash: "a".repeat(64), format: "gp" },
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

  it("preserves initialization and controller cleanup failures", async () => {
    renderViewerShell(document);
    const initializeFailure = new Error("initialize failed");
    const cleanupFailure = new Error("controller destroy failed");
    const dependencies: DefaultOpenSessionDependencies = {
      createApi: () => ({}),
      createAdapter: () => ({ destroy: vi.fn() } as never),
      presentFile: async () => ({
        status: "ready",
        message: "已加载 Song",
        identity: { contentHash: "a".repeat(64), format: "gp" },
        summary: { title: "Song", trackCount: 1, masterBarCount: 1 },
      }),
      waitForScore: async () => ({} as never),
      extractModel: () => ({
        tracks: [{ id: "track-0", sourceIndex: 0, name: "Lead" }],
        timeline: { durationTicks: 0, durationMs: 0, measures: [] },
      }),
      createController: () => ({
        initialize: async () => { throw initializeFailure; },
        destroy: async () => { throw cleanupFailure; },
      } as never),
      mountControls: () => () => undefined,
    };
    const openSession = createDefaultOpenSession(document, {} as never, dependencies);

    const error = await rejectionOf(openSession({
      fileName: "song.gp5",
      bytes: new Uint8Array([1]),
    })) as AggregateError;

    expect(error).toBeInstanceOf(AggregateError);
    expect(error.errors).toEqual([initializeFailure, cleanupFailure]);
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
    expect(summary.textContent).toBe("<img src=x onerror=alert(1)>");
    expect(summary.querySelector("img")).toBeNull();
  });

  it("clears stale summary for an error state", () => {
    renderViewerShell(document);
    const status = document.querySelector("#status") as HTMLElement;
    const summary = document.querySelector("#summary") as HTMLElement;
    summary.textContent = "old summary";

    renderViewerState(status, summary, { status: "error", message: "请选择 Guitar Pro 文件" });

    expect(status.textContent).toBe("请选择 Guitar Pro 文件");
    expect(summary.textContent).toBe("未打开乐谱");
  });
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>(resolvePromise => { resolve = resolvePromise; });
  return { promise, resolve };
}

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected promise to reject");
}
