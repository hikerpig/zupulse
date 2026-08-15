import { describe, expect, it } from "vitest";
import { canonicalJson, sha256Bytes } from "../canonical-json";
import { createPublicPianoformProtocol } from "../benchmark/freeze-public-pianoform-protocol";
import { verifyFrozenProtocol } from "../benchmark/verify-protocol";

describe("public pianoform protocol freezer", () => {
  it("freezes the standard holdout manifest and all four engine environments", () => {
    const manifestBytes = new TextEncoder().encode(canonicalJson(standardHoldoutManifest()));
    const protocol = createPublicPianoformProtocol({
      manifestBytes,
      benchmarkCommit: "8c00cb6",
      frozenAt: "2026-08-12T12:00:00.000Z",
      audiverisVersion: "5.11.0",
      builderSourceBytes: new TextEncoder().encode("builder source"),
      transcodaEnvironment: transcodaEnvironment(),
      legatoEnvironment: legatoEnvironment(),
      rokotEnvironment: rokotEnvironment(),
    });
    const protocolBytes = new TextEncoder().encode(canonicalJson(protocol));

    expect(protocol.manifestSha256).toBe(sha256Bytes(manifestBytes));
    expect(protocol.engines.map((engine) => engine.id)).toEqual(["audiveris", "transcoda", "legato", "rokot"]);
    expect(protocol.builder).toEqual({
      id: "build_public_pianoform_benchmark.py",
      version: "1.0.0",
      sourceSha256: sha256Bytes(new TextEncoder().encode("builder source")),
    });
    for (const engineId of ["audiveris", "transcoda", "legato", "rokot"]) {
      expect(
        verifyFrozenProtocol(protocolBytes, {
          protocolSha256: sha256Bytes(protocolBytes),
          manifestSha256: sha256Bytes(manifestBytes),
          engineId,
          preprocess: "none",
        }).status,
      ).toBe("frozen");
    }
  });

  it("rejects a manifest that is not the standard holdout profile", () => {
    const manifest = standardHoldoutManifest();
    manifest.execution.profile = "quick";

    expect(() =>
      createPublicPianoformProtocol({
        manifestBytes: new TextEncoder().encode(canonicalJson(manifest)),
        benchmarkCommit: "8c00cb6",
        frozenAt: "2026-08-12T12:00:00.000Z",
        audiverisVersion: "5.11.0",
        builderSourceBytes: new Uint8Array(),
        transcodaEnvironment: transcodaEnvironment(),
        legatoEnvironment: legatoEnvironment(),
        rokotEnvironment: rokotEnvironment(),
      }),
    ).toThrow("standard holdout");
  });
});

function standardHoldoutManifest() {
  const manifestItems = [...items("contract", 5), ...items("oracle-system", 36), ...items("full-page", 4)];
  return {
    schemaVersion: "1.0.0" as const,
    corpusId: "public-pianoform-v1-standard-holdout",
    protocolVersion: "1.0.0",
    execution: {
      profile: "standard" as "quick" | "standard",
      maxTotalWallTimeMs: 3_600_000,
      repeatItemIds: manifestItems
        .filter((item) => item.benchmarkSuite === "oracle-system")
        .slice(0, 6)
        .map((item) => item.id),
    },
    items: manifestItems,
  };
}

function items(suite: "contract" | "oracle-system" | "full-page", count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `${suite}-${index}`,
    workId: `${suite}-work-${index}`,
    variantId: "source",
    split: "holdout" as const,
    category: suite,
    benchmarkSuite: suite,
    input: { path: `${suite}/${index}.pdf`, sha256: "a".repeat(64) },
    groundTruth: { path: `${suite}/${index}.musicxml`, sha256: "b".repeat(64), format: "musicxml" as const },
    license: { id: "test", source: "https://example.com" },
  }));
}

function transcodaEnvironment() {
  return {
    engine: { id: "transcoda", revision: "transcoda-revision" },
    model: { sha256: "c".repeat(64) },
    decoder: { grammarConstrained: true, layoutNormalization: true, maxLength: 512, repetitionPenalty: 1.1 },
  };
}

function legatoEnvironment() {
  return {
    engine: { id: "legato", revision: "legato-revision" },
    model: { sha256: "d".repeat(64) },
    visionEncoder: { revision: "vision-revision" },
    runtime: { inferenceDtype: { mps: "float16" } },
    preprocess: { maxPdfPages: 3, normalizedWidth: 1050, minimumHeight: 1485 },
    decoder: { maxLength: 2048, numBeams: 10, repetitionPenalty: 1.1 },
  };
}

function rokotEnvironment() {
  return {
    engine: { id: "rokot", revision: "rokot-revision" },
    model: { sha256: "e".repeat(64) },
    visionProjector: { sha256: "f".repeat(64) },
    runtime: { llamaCppBuild: "b10200", abcConverter: "abc-xml-converter==1.0.1" },
    decoder: { temperature: 0, maxNewTokens: 1600, reasoning: "off", concurrency: 1 },
  };
}
