import { describe, expect, it, vi } from "vitest";
import type { ViewerFile } from "../../host";
import type { ViewerSessionPort } from "../../viewer-session/viewer-session-types";
import type { StudioApplication } from "../../features/harmony-studio/StudioApplication";
import { WorkspaceCoordinator } from "../workspace-coordinator";

function viewerSession(events: string[]): ViewerSessionPort {
  const dispatch = vi.fn(async (command) => {
    if (command.type === "pause-and-flush") events.push("viewer:pauseAndFlush");
  });
  return {
    getSnapshot: () => ({ loopEditor: { measureBounds: [], staffBounds: [] } }),
    subscribe: () => () => undefined,
    dispatch,
    destroy: async () => {
      events.push("viewer:destroy");
    },
  };
}

function fakeStudio(events: string[]) {
  return {
    open: vi.fn(async (_id: string, acquireWorkspace?: () => Promise<void>) => {
      events.push("studio:open");
      await acquireWorkspace?.();
      events.push("studio:runtime");
    }),
    releaseRuntime: vi.fn(async () => {
      events.push("studio:releaseRuntime");
    }),
    destroy: vi.fn(async () => {
      events.push("studio:destroy");
    }),
  };
}

function createCoordinator(
  events: string[],
  options: { openSession?: (file: ViewerFile, id: string) => Promise<ViewerSessionPort> } = {},
) {
  const studio = fakeStudio(events);
  const onViewerReleased = vi.fn();
  const openSession =
    options.openSession ??
    vi.fn(async (_file: ViewerFile, _id: string) => {
      events.push("viewer:open");
      return viewerSession(events);
    });
  const coordinator = new WorkspaceCoordinator({
    openSession,
    studio: studio as unknown as StudioApplication,
    onViewerReleased,
  });
  return { coordinator, studio, onViewerReleased, openSession };
}

const file = { fileName: "score.gp", bytes: new Uint8Array([1]) };

describe("WorkspaceCoordinator", () => {
  it("releases the previous Studio runtime before opening a Viewer session", async () => {
    const events: string[] = [];
    const { coordinator, openSession } = createCoordinator(events);

    await coordinator.openViewer("score-1", async () => file);

    expect(events).toEqual(["studio:releaseRuntime", "viewer:open"]);
    expect(openSession).toHaveBeenCalledWith(file, "score-1", undefined);
    expect(coordinator.hasSession("score-1")).toBe(true);
    expect(coordinator.getCurrentSession()).toBeDefined();
    await coordinator.destroy();
  });

  it("releases the active Viewer session when Studio takes over", async () => {
    const events: string[] = [];
    const { coordinator, onViewerReleased } = createCoordinator(events);

    await coordinator.openViewer("score-1", async () => file);
    await coordinator.openStudio("score-2");

    expect(events).toEqual(["studio:releaseRuntime", "viewer:open", "studio:open", "viewer:destroy", "studio:runtime"]);
    expect(onViewerReleased).toHaveBeenCalledOnce();
    expect(coordinator.hasSession("score-1")).toBe(false);
    await coordinator.destroy();
  });

  it("waits for an in-flight Viewer open before replacing it with Studio", async () => {
    const events: string[] = [];
    let resolveViewer: ((session: ViewerSessionPort) => void) | undefined;
    const pendingSession = new Promise<ViewerSessionPort>((resolve) => {
      resolveViewer = resolve;
    });
    const { coordinator, studio } = createCoordinator(events, {
      openSession: vi.fn(async () => {
        events.push("viewer:open");
        return pendingSession;
      }),
    });

    const viewerOpen = coordinator.openViewer("score-1", async () => file);
    const studioOpen = coordinator.openStudio("score-1");

    await vi.waitFor(() => expect(events).toContain("viewer:open"));
    expect(studio.open).not.toHaveBeenCalled();
    resolveViewer?.(viewerSession(events));
    await Promise.all([viewerOpen, studioOpen]);

    expect(studio.open).toHaveBeenCalledOnce();
    expect(events).toEqual(["studio:releaseRuntime", "viewer:open", "studio:open", "viewer:destroy", "studio:runtime"]);
    await coordinator.destroy();
  });

  it("flushes and destroys the Viewer session on route leave", async () => {
    const events: string[] = [];
    const { coordinator, onViewerReleased } = createCoordinator(events);

    await coordinator.openViewer("score-1", async () => file);
    await coordinator.releaseViewer("score-1");

    expect(events).toEqual(["studio:releaseRuntime", "viewer:open", "viewer:pauseAndFlush", "viewer:destroy"]);
    expect(onViewerReleased).toHaveBeenCalledOnce();
    expect(coordinator.hasSession("score-1")).toBe(false);
    await coordinator.destroy();
  });

  it("destroys the Viewer session without flushing when the score is deleted", async () => {
    const events: string[] = [];
    const { coordinator, onViewerReleased } = createCoordinator(events);

    await coordinator.openViewer("score-1", async () => file);
    await coordinator.deleteViewer("score-1");

    expect(events).toEqual(["studio:releaseRuntime", "viewer:open", "viewer:destroy"]);
    expect(onViewerReleased).not.toHaveBeenCalled();
    await coordinator.destroy();
  });

  it("destroys the Viewer session before the Studio application", async () => {
    const events: string[] = [];
    const { coordinator } = createCoordinator(events);

    await coordinator.openViewer("score-1", async () => file);
    await coordinator.destroy();

    expect(events).toEqual(["studio:releaseRuntime", "viewer:open", "viewer:destroy", "studio:destroy"]);
  });

  it("keeps a Studio open from releasing the Viewer when validation fails", async () => {
    const events: string[] = [];
    const { coordinator, studio, onViewerReleased } = createCoordinator(events);
    studio.open.mockImplementation(async () => {
      events.push("studio:open");
      events.push("studio:validation-failed");
    });

    await coordinator.openViewer("score-1", async () => file);
    await coordinator.openStudio("score-2");

    expect(events).toEqual(["studio:releaseRuntime", "viewer:open", "studio:open", "studio:validation-failed"]);
    expect(onViewerReleased).not.toHaveBeenCalled();
    expect(coordinator.hasSession("score-1")).toBe(true);
    await coordinator.destroy();
  });
});
