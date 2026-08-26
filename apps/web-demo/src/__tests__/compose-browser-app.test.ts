// @vitest-environment jsdom
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { composeBrowserApp } from "../compose-browser-app";
import { RemoteRecognitionClient } from "../recognition/RemoteRecognitionClient";

const availableCapabilities = {
  schemaVersion: "1.0.0",
  engines: [{ id: "rokot", version: "1.0.0", available: true, inputKinds: ["pdf"] }],
};

const telemetryConfig = {
  appVersion: "0.1.0",
  buildId: "browser-build-1",
  releaseChannel: "alpha",
  projectToken: "phc_test",
  apiHost: "https://us.i.posthog.com",
};

beforeEach(() => {
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: new IDBFactory() });
  window.localStorage.clear();
});

describe("composeBrowserApp", () => {
  it("initializes the Sheet Library and keeps PDF OMR closed when recognition is unavailable", async () => {
    const persistStorage = vi.fn(async () => true);
    const composed = await composeBrowserApp({
      ownerDocument: document,
      fetch: vi.fn(async () => new Response("nope", { status: 500 })),
      persistStorage,
      recognitionProbeTimeoutMs: 20,
      telemetryConfig,
    });

    await expect(composed.dependencies.library.repository.list()).resolves.toEqual([]);
    expect(composed.dependencies.capabilities).toMatchObject({
      harmonyAnalysis: true,
      pdfOmrWorkbench: false,
      pdfOmrHistory: false,
    });
    expect(composed.dependencies.pdfOmrHistory).toBeUndefined();
    expect(persistStorage).toHaveBeenCalledOnce();
  });

  it("exposes Remote Recognition when an engine is available", async () => {
    const composed = await composeBrowserApp({
      ownerDocument: document,
      telemetryConfig,
      fetch: vi.fn(async (url) => {
        if (String(url).includes("/api/recognition/v1/capabilities")) {
          return Response.json(availableCapabilities);
        }
        return new Response("{}", { status: 200 });
      }),
    });

    expect(composed.dependencies.capabilities).toMatchObject({ pdfOmrWorkbench: true, pdfOmrHistory: true });
    expect(composed.dependencies.pdfOmrHistory).toBeInstanceOf(RemoteRecognitionClient);
    expect(composed.dependencies.openPdfOmrPreview).toEqual(expect.any(Function));
  });

  it("writes the LocaleHost effective locale into telemetry events", async () => {
    window.localStorage.setItem("zupulse-locale", "en-US");
    const fetcher = vi.fn(async (url) => {
      if (String(url).includes("/api/recognition")) return new Response("nope", { status: 500 });
      return new Response("{}", { status: 200 });
    });

    const composed = await composeBrowserApp({ ownerDocument: document, fetch: fetcher, telemetryConfig });
    expect(composed.dependencies.localeHost?.initialState.effectiveLocale).toBe("en-US");
    expect(document.documentElement.lang).toBe("en-US");

    composed.startSession();
    await Promise.resolve();

    const captureCall = fetcher.mock.calls.find(([url]) => String(url).includes("/capture/"));
    expect(captureCall).toBeDefined();
    const payload = JSON.parse(String((captureCall?.[1] as RequestInit | undefined)?.body));
    expect(payload.properties.effective_locale).toBe("en-US");
  });
});
