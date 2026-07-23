// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import type { ViewerAppHandle } from "@zupulse/web-viewer";
import { attachExternalOpen, externalOpenEventName } from "../external-open";

describe("external open", () => {
  it("registers before readiness and imports ordered token sources exactly once", async () => {
    const calls: string[] = [];
    const application = {
      importScoreSources: vi.fn(async (sources) => {
        calls.push(sources[0]!.fileName);
        await sources[0]!.readBytes();
      }),
    } as unknown as ViewerAppHandle;
    const readyHandler = {
      postMessage: vi.fn(() => {
        dispatch("event-1", "first.gp", "token-1", 1);
        dispatch("event-2", "second.musicxml", "token-2", 2);
        dispatch("event-1", "first.gp", "token-1", 1);
      }),
    };
    const fetchBytes = vi.fn(async (input: string | URL | Request) => {
      const size = String(input).endsWith("token-1") ? 1 : 2;
      return new Response(new Uint8Array(size));
    });

    const detach = attachExternalOpen({ target: window, application, readyHandler, fetchBytes });
    await vi.waitFor(() => expect(application.importScoreSources).toHaveBeenCalledTimes(2));

    expect(readyHandler.postMessage).toHaveBeenCalledOnce();
    expect(calls).toEqual(["first.gp", "second.musicxml"]);
    expect(fetchBytes.mock.calls.map(([url]) => url)).toEqual(["/__data/token-1", "/__data/token-2"]);

    detach();
    dispatch("event-3", "ignored.gp", "token-3", 1);
    await Promise.resolve();
    expect(application.importScoreSources).toHaveBeenCalledTimes(2);
  });

  it("ignores malformed native events", async () => {
    const application = {
      importScoreSources: vi.fn(),
    } as unknown as ViewerAppHandle;
    const detach = attachExternalOpen({ target: window, application });

    window.dispatchEvent(new CustomEvent(externalOpenEventName, { detail: { fileToken: "missing-fields" } }));
    await Promise.resolve();

    expect(application.importScoreSources).not.toHaveBeenCalled();
    detach();
  });
});

function dispatch(eventId: string, fileName: string, fileToken: string, sizeBytes: number): void {
  window.dispatchEvent(
    new CustomEvent(externalOpenEventName, {
      detail: { eventId, fileName, fileToken, sizeBytes },
    }),
  );
}
