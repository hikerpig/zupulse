import { describe, expect, it } from "vitest";

import {
  createNoopTelemetryPort,
  createSafeTelemetryPort,
  sanitizeTelemetryException,
  TelemetryExceptionBudget,
  telemetryEnvelopeSchema,
  telemetryPreferenceStateSchema,
  type TelemetryEnvelope,
} from "../index";

const envelope = {
  schemaVersion: 1,
  eventId: "11111111-1111-4111-8111-111111111111",
  installationId: "22222222-2222-4222-8222-222222222222",
  applicationSessionId: "33333333-3333-4333-8333-333333333333",
  occurredAt: "2026-08-08T00:00:00.000Z",
  platform: "browser",
  runtime: "browser",
  appVersion: "0.1.0",
  buildId: "build-1",
  releaseChannel: "alpha",
  effectiveLocale: "zh-CN",
  event: { name: "application_session_started" },
} satisfies TelemetryEnvelope;

describe("telemetry contracts", () => {
  it("accepts the allowlisted event envelope and rejects extra event fields", () => {
    expect(telemetryEnvelopeSchema.parse(envelope)).toEqual(envelope);
    expect(() =>
      telemetryEnvelopeSchema.parse({
        ...envelope,
        event: { name: "application_session_started", title: "secret" },
      }),
    ).toThrow();
    expect(() =>
      telemetryEnvelopeSchema.parse({
        ...envelope,
        event: {
          name: "application_issue_presented",
          surface: "library",
          issueCode: "IMPORT_FAILED",
          recoverable: true,
        },
      }),
    ).toThrow();
  });

  it("requires installation identity only when telemetry is enabled", () => {
    expect(
      telemetryPreferenceStateSchema.parse({
        schemaVersion: 1,
        enabled: false,
        noticeAcknowledged: true,
      }),
    ).toEqual({ schemaVersion: 1, enabled: false, noticeAcknowledged: true });
    expect(() =>
      telemetryPreferenceStateSchema.parse({
        schemaVersion: 1,
        enabled: false,
        noticeAcknowledged: true,
        installationId: "22222222-2222-4222-8222-222222222222",
      }),
    ).toThrow();
  });

  it("redacts paths, URLs, identifiers, secrets, and bounds exception data", () => {
    const error = new Error(
      `Failed at /Users/alice/project/src/App.tsx?score=secret id=11111111-1111-4111-8111-111111111111 ` +
        "token=super-secret https://example.test/path?q=secret#fragment",
    );
    error.stack = Array.from({ length: 60 }, (_, index) => `at fn${index} (/Users/alice/project/src/App.tsx:1:1)`).join(
      "\n",
    );

    const sanitized = sanitizeTelemetryException(error);
    expect(sanitized).toBeDefined();
    expect(sanitized?.message.length).toBeLessThanOrEqual(512);
    expect(sanitized?.stack?.split("\n")).toHaveLength(50);
    expect(sanitized?.message).not.toContain("/Users/alice");
    expect(sanitized?.message).not.toContain("https://");
    expect(sanitized?.message).not.toContain("super-secret");
    expect(sanitized?.message).not.toContain("11111111-1111-4111-8111-111111111111");
  });

  it("keeps a provider boundary non-throwing", async () => {
    const noop = createNoopTelemetryPort();
    expect(() => noop.capture(envelope)).not.toThrow();
    expect(() => noop.captureException(new Error("boom"), { runtime: "browser", handled: true })).not.toThrow();
    await expect(noop.flush(10)).resolves.toBeUndefined();

    const safe = createSafeTelemetryPort({
      capture: () => {
        throw new Error("provider failure");
      },
      captureException: () => {
        throw new Error("provider failure");
      },
      flush: async () => {
        throw new Error("provider failure");
      },
    });
    expect(() => safe.capture(envelope)).not.toThrow();
    expect(() => safe.captureException(new Error("boom"), { runtime: "browser", handled: true })).not.toThrow();
    await expect(safe.flush(10)).resolves.toBeUndefined();
  });

  it("enforces one fingerprint per minute and a session exception budget", () => {
    const budget = new TelemetryExceptionBudget();
    expect(budget.allow("session", "same", 0)).toBe(true);
    expect(budget.allow("session", "same", 59_999)).toBe(false);
    expect(budget.allow("session", "same", 60_000)).toBe(true);

    for (let index = 2; index < 20; index += 1) {
      expect(budget.allow("session", `fingerprint-${index}`, 60_000 + index)).toBe(true);
    }
    expect(budget.allow("session", "one-too-many", 61_000)).toBe(false);
  });
});
