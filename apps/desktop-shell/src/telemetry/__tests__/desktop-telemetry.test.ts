import { describe, expect, it, vi } from "vitest";
import { createDesktopTelemetryPort } from "../desktop-telemetry";

const base = {
  context: {
    enabled: true,
    installationId: "11111111-1111-4111-8111-111111111111",
    applicationSessionId: "22222222-2222-4222-8222-222222222222",
  },
  runtime: "renderer" as const,
  appVersion: "0.1.0",
  buildId: "desktop-build",
  releaseChannel: "alpha",
  projectToken: "phc_test",
  apiHost: "https://us.i.posthog.com",
  effectiveLocale: "zh-CN" as const,
};

describe("createDesktopTelemetryPort", () => {
  it("sends one strict event with Main-owned identity and runtime attribution", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}"));
    const port = createDesktopTelemetryPort({ ...base, fetcher });
    port.capture({ name: "application_session_started" });
    await Promise.resolve();

    expect(fetcher).toHaveBeenCalledOnce();
    const request = fetcher.mock.calls[0]?.[1];
    const payload = JSON.parse(String(request?.body));
    expect(payload.api_key).toBe("phc_test");
    expect(payload.properties).toMatchObject({
      distinct_id: base.context.installationId,
      application_session_id: base.context.applicationSessionId,
      runtime: "renderer",
      platform: "desktop",
    });
    expect(JSON.stringify(payload)).not.toContain("current_url");
  });

  it("returns a no-op port for disabled state, invalid channel, or invalid host", () => {
    const fetcher = vi.fn<typeof fetch>();
    const port = createDesktopTelemetryPort({ ...base, context: { enabled: false }, fetcher });
    port.capture({ name: "application_session_started" });
    expect(fetcher).not.toHaveBeenCalled();
    expect(
      createDesktopTelemetryPort({ ...base, releaseChannel: "development", fetcher }).capture({
        name: "application_session_started",
      }),
    ).toBeUndefined();
    expect(
      createDesktopTelemetryPort({ ...base, apiHost: "https://evil.example", fetcher }).capture({
        name: "application_session_started",
      }),
    ).toBeUndefined();
  });

  it("sanitizes exception payloads and suppresses duplicate fingerprints", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}"));
    const port = createDesktopTelemetryPort({ ...base, fetcher });
    const error = new Error("failed at /Users/alice/score.gp token=secret");
    port.captureException(error, { runtime: "renderer", handled: false, operation: "renderer.load" });
    port.captureException(error, { runtime: "renderer", handled: false, operation: "renderer.load" });
    await Promise.resolve();

    expect(fetcher).toHaveBeenCalledOnce();
    const payload = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(payload.event).toBe("$exception");
    expect(payload.properties.exception_message).not.toContain("/Users/alice");
    expect(payload.properties.exception_message).not.toContain("token=secret");
  });

  it("does not surface provider failures through capture or flush", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error("offline"));
    const port = createDesktopTelemetryPort({ ...base, fetcher });

    expect(() => port.capture({ name: "application_session_started" })).not.toThrow();
    await expect(port.flush(300)).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
