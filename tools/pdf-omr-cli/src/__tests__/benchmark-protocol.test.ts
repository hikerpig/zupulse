import { describe, expect, it } from "vitest";
import { sha256Bytes } from "../canonical-json";
import { verifyFrozenProtocol } from "../benchmark/verify-protocol";

const manifestSha256 = "a".repeat(64);

describe("frozen benchmark protocol", () => {
  it("accepts only the listed manifest, engine and preprocessing variant", () => {
    const bytes = protocolBytes();
    const protocolSha256 = sha256Bytes(bytes);

    expect(
      verifyFrozenProtocol(bytes, {
        protocolSha256,
        manifestSha256,
        engineId: "audiveris",
        preprocess: "none",
      }),
    ).toMatchObject({ status: "frozen" });
  });

  it("retains frozen render, segmentation and decoder declarations", () => {
    const bytes = protocolBytes({
      render: { id: "source-pdf", version: "1", dpi: 300 },
      segmentation: { id: "provided-system-crop", version: "1", scope: "system-crop" },
      decoder: { id: "rokot-abc", version: "1", parameters: { temperature: 0 } },
    });

    expect(
      verifyFrozenProtocol(bytes, {
        protocolSha256: sha256Bytes(bytes),
        manifestSha256,
        engineId: "audiveris",
        preprocess: "none",
      }),
    ).toMatchObject({
      render: { id: "source-pdf" },
      segmentation: { scope: "system-crop" },
      decoder: { id: "rokot-abc" },
    });
  });

  it.each([
    ["protocol hash", { protocolSha256: "b".repeat(64) }, "protocol-hash-mismatch"],
    ["manifest hash", { manifestSha256: "b".repeat(64) }, "manifest-hash-mismatch"],
    ["engine", { engineId: "unknown" }, "engine-not-frozen"],
    ["preprocess", { preprocess: "deskew-v2" }, "preprocess-not-frozen"],
  ])("rejects an unlisted %s", (_label, override, reason) => {
    const bytes = protocolBytes();

    expect(() =>
      verifyFrozenProtocol(bytes, {
        protocolSha256: sha256Bytes(bytes),
        manifestSha256,
        engineId: "audiveris",
        preprocess: "none",
        ...override,
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_INPUT", context: { reason } }));
  });
});

function protocolBytes(overrides: Record<string, unknown> = {}): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      schemaVersion: "1.0.0",
      status: "frozen",
      frozenAt: "2026-07-28T12:00:00.000Z",
      manifestSha256,
      benchmarkCommit: "9bbff5b",
      engines: [
        {
          id: "audiveris",
          version: "5.10.2",
          parameters: {},
        },
      ],
      preprocessVariants: ["none"],
      gates: {
        jointF1: 0.9,
        validMeasureRate: 0.95,
        parseRate: 0.95,
        structuralAgreementRate: 0.9,
        harmonyPrecisionDelta: -0.05,
        falseConfidentChordRate: 0.03,
        reproducibilityAgreementRate: 1,
        cancelLatencyP95Ms: 2000,
      },
      ...overrides,
    }),
  );
}
