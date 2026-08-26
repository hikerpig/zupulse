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
  projectToken: "phc_test",
  apiHost: "https://us.i.posthog.com",
};

describe("createPostHogTelemetryPort", () => {
  it("posts an allowlisted envelope to the US capture origin", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}"));
    const port = createPostHogTelemetryPort({ ...base, fetcher });
    port?.capture({ name: "application_session_started" });
    await Promise.resolve();

    expect(fetcher).toHaveBeenCalledOnce();
    expect(String(fetcher.mock.calls[0]?.[0])).toBe("https://us.i.posthog.com/capture/");
    const payload = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(payload).toMatchObject({ api_key: "phc_test", event: "application_session_started" });
    expect(payload.properties).toEqual(
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

  it("returns undefined for missing token, invalid channel, or disallowed host", () => {
    expect(createPostHogTelemetryPort({ ...base, projectToken: "" })).toBeUndefined();
    expect(createPostHogTelemetryPort({ ...base, releaseChannel: "development" })).toBeUndefined();
    expect(createPostHogTelemetryPort({ ...base, apiHost: "https://evil.example" })).toBeUndefined();
  });

  it("sanitizes exceptions and suppresses duplicate fingerprints", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}"));
    const port = createPostHogTelemetryPort({ ...base, fetcher });
    const error = new Error("failed at /Users/alice/score.gp token=secret");
    port?.captureException(error, { runtime: "renderer", handled: false, operation: "renderer.load" });
    port?.captureException(error, { runtime: "renderer", handled: false, operation: "renderer.load" });
    await Promise.resolve();

    expect(fetcher).toHaveBeenCalledOnce();
    const payload = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(payload.event).toBe("$exception");
    expect(payload.properties.exception_message).not.toContain("/Users/alice");
    expect(payload.properties.exception_message).not.toContain("token=secret");
  });

  it("does not throw when the provider request fails", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error("offline"));
    const port = createPostHogTelemetryPort({ ...base, fetcher });
    expect(() => port?.capture({ name: "application_session_started" })).not.toThrow();
    await expect(port?.flush(300)).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
