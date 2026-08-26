import { describe, expect, it, vi } from "vitest";
import { createPostHogTelemetryPort } from "../posthog-port";

const identity = {
  getEnabled: () => true,
  getInstallationId: () => "11111111-1111-4111-8111-111111111111",
  getApplicationSessionId: () => "22222222-2222-4222-8222-222222222222",
};

const base = {
  ...identity,
  platform: "desktop" as const,
  runtime: "renderer" as const,
  appVersion: "0.1.0",
  buildId: "build-1",
  releaseChannel: "alpha",
  effectiveLocale: "zh-CN" as const,
  createEventId: () => "33333333-3333-4333-8333-333333333333",
};

describe("createPostHogTelemetryPort", () => {
  it("sends an allowlisted envelope through the injected transport", () => {
    const send = vi.fn();
    const port = createPostHogTelemetryPort({ ...base, send });
    port?.capture({ name: "application_session_started" });

    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0]?.[0]).toBe("application_session_started");
    expect(send.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        distinct_id: identity.getInstallationId(),
        application_session_id: identity.getApplicationSessionId(),
        platform: "desktop",
        runtime: "renderer",
        effective_locale: "zh-CN",
        $process_person_profile: false,
        $geoip_disable: true,
      }),
    );
  });

  it("returns undefined for missing build identity or invalid channel", () => {
    const send = vi.fn();
    expect(createPostHogTelemetryPort({ ...base, send, appVersion: "" })).toBeUndefined();
    expect(createPostHogTelemetryPort({ ...base, send, releaseChannel: "development" })).toBeUndefined();
  });

  it("sanitizes exceptions and suppresses duplicate fingerprints", () => {
    const send = vi.fn();
    const port = createPostHogTelemetryPort({ ...base, send });
    const error = new Error("failed at /Users/alice/score.gp token=secret");
    port?.captureException(error, { runtime: "renderer", handled: false, operation: "renderer.load" });
    port?.captureException(error, { runtime: "renderer", handled: false, operation: "renderer.load" });

    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0]?.[0]).toBe("$exception");
    expect(String(send.mock.calls[0]?.[1]?.exception_message)).not.toContain("/Users/alice");
    expect(String(send.mock.calls[0]?.[1]?.exception_message)).not.toContain("token=secret");
  });

  it("does not throw when the injected transport throws", async () => {
    const send = vi.fn(() => {
      throw new Error("offline");
    });
    const port = createPostHogTelemetryPort({ ...base, send });
    expect(() => port?.capture({ name: "application_session_started" })).not.toThrow();
    await expect(port?.flush(300)).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledOnce();
  });
});
