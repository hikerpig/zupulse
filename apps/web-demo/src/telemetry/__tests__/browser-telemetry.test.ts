// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createBrowserTelemetry } from "../browser-telemetry";

const validConfig = {
  appVersion: "0.1.0",
  buildId: "browser-build-1",
  releaseChannel: "alpha" as const,
  projectToken: "phc_test",
  apiHost: "https://us.i.posthog.com",
};

describe("createBrowserTelemetry", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("defaults to enabled with an unacknowledged notice and persists a new identity", () => {
    const telemetry = createBrowserTelemetry({ ownerDocument: document, config: validConfig });

    expect(telemetry.getState()).toMatchObject({ enabled: true, noticeAcknowledged: false });
    expect(telemetry.getState().installationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.parse(window.localStorage.getItem("zupulse-telemetry") ?? "null")).toMatchObject({
      schemaVersion: 1,
      enabled: true,
      noticeAcknowledged: false,
      installationId: telemetry.getState().installationId,
    });
  });

  it("fails closed for corrupt telemetry state without touching other preferences", () => {
    window.localStorage.setItem("zupulse-telemetry", JSON.stringify({ enabled: "yes" }));
    window.localStorage.setItem("zupulse-locale", "zh-CN");

    const telemetry = createBrowserTelemetry({ ownerDocument: document, config: validConfig });

    expect(telemetry.getState()).toEqual({ schemaVersion: 1, enabled: false, noticeAcknowledged: false });
    expect(window.localStorage.getItem("zupulse-locale")).toBe("zh-CN");
  });

  it("sends one allowlisted launch event and never sends raw application data", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status: 200 }));
    const telemetry = createBrowserTelemetry({ ownerDocument: document, config: validConfig, fetcher });

    telemetry.acknowledgeNotice();
    telemetry.startSession();
    telemetry.startSession();
    await Promise.resolve();

    expect(fetcher).toHaveBeenCalledTimes(1);
    const request = fetcher.mock.calls[0]?.[1];
    const payload = JSON.parse(String(request?.body));
    expect(payload).toMatchObject({ api_key: "phc_test", event: "application_session_started" });
    expect(payload.properties).toEqual(
      expect.objectContaining({
        schema_version: 1,
        distinct_id: telemetry.getState().installationId,
        application_session_id: expect.any(String),
        platform: "browser",
        runtime: "browser",
        app_version: "0.1.0",
        build_id: "browser-build-1",
        release_channel: "alpha",
        effective_locale: "zh-CN",
      }),
    );
    expect(JSON.stringify(payload)).not.toContain("libraryScoreId");
  });

  it("disables before changing state, clears identity, and re-enables with a new identity/session", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status: 200 }));
    const telemetry = createBrowserTelemetry({ ownerDocument: document, config: validConfig, fetcher });
    const firstIdentity = telemetry.getState().installationId;

    await telemetry.setPreference(false);
    expect(telemetry.getState()).toEqual({ schemaVersion: 1, enabled: false, noticeAcknowledged: true });
    expect(JSON.parse(window.localStorage.getItem("zupulse-telemetry") ?? "null")).not.toHaveProperty("installationId");

    await telemetry.setPreference(true);
    expect(telemetry.getState().installationId).not.toBe(firstIdentity);
    expect(telemetry.getState().enabled).toBe(true);
    await Promise.resolve();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("uses a no-op port when the release config is not safe", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const telemetry = createBrowserTelemetry({
      ownerDocument: document,
      config: { ...validConfig, projectToken: "", apiHost: "https://evil.example" },
      fetcher,
    });

    telemetry.startSession();
    await telemetry.port.flush(1);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("sanitizes and budgets unexpected exceptions", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status: 200 }));
    const telemetry = createBrowserTelemetry({ ownerDocument: document, config: validConfig, fetcher });
    const error = new Error("failed at /Users/alice/score.gp token=secret");
    telemetry.port.captureException(error, { runtime: "browser", handled: false, operation: "startup" });
    telemetry.port.captureException(error, { runtime: "browser", handled: false, operation: "startup" });
    await Promise.resolve();

    expect(fetcher).toHaveBeenCalledOnce();
    const payload = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(payload.event).toBe("$exception");
    expect(payload.properties.exception_message).not.toContain("/Users/alice");
    expect(payload.properties.exception_message).not.toContain("token=secret");
  });

  it("does not surface provider failures through capture or flush", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error("offline"));
    const telemetry = createBrowserTelemetry({ ownerDocument: document, config: validConfig, fetcher });

    expect(() => telemetry.port.capture({ name: "application_session_started" })).not.toThrow();
    await expect(telemetry.port.flush(300)).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
