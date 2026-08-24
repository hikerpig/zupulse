import { describe, expect, it } from "vitest";
import {
  BRIDGE_SCHEMA_VERSION,
  bridgeRequestSchema,
  bridgeResponseSchemas,
  capabilitiesSchema,
  createBridgeRequest,
  parseBridgeResponse,
} from "../schemas";

const hash = "a".repeat(64);

describe("bridge schemas", () => {
  it("accepts only closed recognition provider setting requests and path-free responses", () => {
    expect(
      createBridgeRequest("recognitionSettings.selectResource", "selection-1", {
        providerId: "rokot",
        fieldId: "model",
      }).payload,
    ).toEqual({ providerId: "rokot", fieldId: "model" });
    expect(
      createBridgeRequest("recognitionSettings.selectResource", "selection-manual", {
        providerId: "rokot",
        fieldId: "model",
        path: "/opt/models/rokot.gguf",
      }).payload,
    ).toEqual({ providerId: "rokot", fieldId: "model", path: "/opt/models/rokot.gguf" });
    expect(() =>
      createBridgeRequest("recognitionSettings.selectResource", "selection-empty", {
        providerId: "rokot",
        fieldId: "model",
        path: "   ",
      } as never),
    ).toThrow();
    expect(() =>
      createBridgeRequest("recognitionSettings.selectResource", "selection-2", {
        providerId: "rokot",
        fieldId: "repository",
      } as never),
    ).toThrow();
    expect(
      parseBridgeResponse("recognitionSettings.list", {
        providers: [
          {
            id: "audiveris",
            state: "ready",
            version: "5.3",
            inputKinds: ["pdf", "image"],
            hasExplicitConfiguration: false,
            fields: [],
          },
          { id: "rokot", state: "unconfigured", inputKinds: ["pdf"], hasExplicitConfiguration: false, fields: [] },
          { id: "legato", state: "unconfigured", inputKinds: ["pdf"], hasExplicitConfiguration: false, fields: [] },
        ],
      }),
    ).toBeTruthy();
    expect(() =>
      parseBridgeResponse("recognitionSettings.list", {
        providers: [
          {
            id: "audiveris",
            state: "ready",
            version: "5.3",
            inputKinds: ["pdf", "image"],
            hasExplicitConfiguration: true,
            fields: [{ id: "executable", label: "/Applications/Audiveris" }],
          },
          { id: "rokot", state: "unconfigured", inputKinds: ["pdf"], hasExplicitConfiguration: false, fields: [] },
          { id: "legato", state: "unconfigured", inputKinds: ["pdf"], hasExplicitConfiguration: false, fields: [] },
        ],
      }),
    ).toThrow();
    expect(() =>
      parseBridgeResponse("recognitionSettings.list", {
        providers: [
          {
            id: "audiveris",
            state: "unconfigured",
            inputKinds: ["pdf", "image"],
            hasExplicitConfiguration: false,
            fields: [],
          },
          { id: "rokot", state: "unconfigured", inputKinds: ["pdf"], hasExplicitConfiguration: false, fields: [] },
          { id: "legato", state: "unconfigured", inputKinds: ["pdf"], hasExplicitConfiguration: false, fields: [] },
          { id: "transcoda", state: "unconfigured", inputKinds: ["pdf"], hasExplicitConfiguration: false, fields: [] },
        ],
      }),
    ).toThrow();
  });

  it("rejects unknown message types", () => {
    expect(() =>
      bridgeRequestSchema.parse({
        bridgeVersion: BRIDGE_SCHEMA_VERSION,
        correlationId: "x",
        type: "electron.send",
        payload: {},
      }),
    ).toThrow();
    expect(() =>
      bridgeRequestSchema.parse({
        bridgeVersion: BRIDGE_SCHEMA_VERSION,
        correlationId: "obsolete-diagnostics-directory",
        type: "diagnostics.openDirectory",
        payload: {},
      }),
    ).toThrow();
  });

  it("rejects additional envelope and payload fields", () => {
    expect(() =>
      bridgeRequestSchema.parse({
        bridgeVersion: BRIDGE_SCHEMA_VERSION,
        correlationId: "x",
        type: "app.lifecycleAck",
        payload: { fileRef: "legacy" },
      }),
    ).toThrow();
    expect(() =>
      bridgeRequestSchema.parse({
        bridgeVersion: BRIDGE_SCHEMA_VERSION,
        correlationId: "x",
        type: "app.lifecycleAck",
        payload: {},
        channel: "legacy",
      }),
    ).toThrow();
  });

  it("allows only structured diagnostic fields without sensitive payloads", () => {
    const valid = {
      bridgeVersion: BRIDGE_SCHEMA_VERSION,
      correlationId: "diagnostic-1",
      type: "diagnostics.write",
      payload: {
        code: "IMPORT_COMPLETE",
        operation: "library.open",
        errorCode: "IMPORT_FAILED",
        durationMs: 12,
        contentHashPrefix: "abcdef12",
      },
    };
    expect(bridgeRequestSchema.parse(valid)).toEqual(valid);
    for (const field of ["path", "token", "fileName", "metadata", "payload", "message"]) {
      expect(() =>
        bridgeRequestSchema.parse({
          ...valid,
          payload: { ...valid.payload, [field]: "secret" },
        }),
      ).toThrow();
    }
    expect(() =>
      bridgeRequestSchema.parse({
        ...valid,
        payload: { ...valid.payload, contentHashPrefix: hash },
      }),
    ).toThrow();
    expect(() =>
      bridgeRequestSchema.parse({
        ...valid,
        payload: { ...valid.payload, operation: "x".repeat(65) },
      }),
    ).toThrow();
    expect(() =>
      bridgeRequestSchema.parse({
        ...valid,
        payload: { ...valid.payload, operation: "future.operation" },
      }),
    ).toThrow();
    expect(() =>
      bridgeRequestSchema.parse({
        ...valid,
        payload: { ...valid.payload, errorCode: "not stable" },
      }),
    ).toThrow();
  });

  it("models temporary file access without platform mechanisms", () => {
    expect(
      capabilitiesSchema.parse({
        fileAccess: {
          openExternalFile: true,
          persistentFileReferences: false,
          localLibraryImport: false,
        },
        storage: { sqliteIndex: false, sidecarPayload: true },
        sync: { available: false, provider: "none" },
        audio: { webAudio: true, nativeBridge: false },
        localization: { changeLocale: true },
        externalNavigation: { openUrl: false },
      }).fileAccess.persistentFileReferences,
    ).toBe(false);
  });

  it("creates typed envelopes and parses the response selected by request type", () => {
    expect(createBridgeRequest("file.select", "select-1", { multiple: true })).toEqual({
      bridgeVersion: BRIDGE_SCHEMA_VERSION,
      correlationId: "select-1",
      type: "file.select",
      payload: { multiple: true },
    });
    expect(parseBridgeResponse("file.select", { status: "cancelled" })).toEqual({
      status: "cancelled",
    });
    expect(() =>
      parseBridgeResponse("file.select", {
        status: "selected",
        files: [{ fileToken: "token", fileName: "score.gp", sizeBytes: 3, legacyPath: "/tmp/score.gp" }],
      }),
    ).toThrow();
  });

  it("accepts only secure external-navigation URLs", () => {
    const request = createBridgeRequest("external.openUrl", "external-1", {
      url: "https://github.com/hikerpig/zupulse",
    });

    expect(parseBridgeResponse(request.type, {})).toEqual({});
    expect(() =>
      createBridgeRequest("external.openUrl", "external-2", {
        url: "http://github.com/hikerpig/zupulse",
      }),
    ).toThrow();
  });

  it("advertises external navigation as an explicit host capability", () => {
    expect(
      capabilitiesSchema.parse({
        fileAccess: {
          openExternalFile: true,
          persistentFileReferences: false,
          localLibraryImport: false,
        },
        storage: { sqliteIndex: false, sidecarPayload: true },
        sync: { available: false, provider: "none" },
        audio: { webAudio: true, nativeBridge: false },
        localization: { changeLocale: true },
        externalNavigation: { openUrl: true },
      }).externalNavigation,
    ).toEqual({ openUrl: true });
  });

  it("validates handshake and byte responses", () => {
    expect(
      bridgeResponseSchemas["app.handshake"].parse({
        appVersion: "0.1.0",
        bridgeVersion: BRIDGE_SCHEMA_VERSION,
        rendererBuildHash: hash,
        capabilities: {
          fileAccess: {
            openExternalFile: true,
            persistentFileReferences: false,
            localLibraryImport: false,
          },
          storage: { sqliteIndex: false, sidecarPayload: true },
          sync: { available: false, provider: "none" },
          audio: { webAudio: true, nativeBridge: false },
          localization: { changeLocale: true },
          externalNavigation: { openUrl: false },
        },
        locale: { preference: "system", effectiveLocale: "en-US" },
      }).rendererBuildHash,
    ).toBe(hash);
    expect(
      bridgeResponseSchemas["file.readBytes"].parse({
        fileName: "score.gp",
        bytes: new Uint8Array([1]),
      }).bytes,
    ).toBeInstanceOf(Uint8Array);
    expect(
      bridgeResponseSchemas["app.locale.setPreference"].parse({
        preference: "zh-CN",
        effectiveLocale: "zh-CN",
      }),
    ).toEqual({ preference: "zh-CN", effectiveLocale: "zh-CN" });
  });

  it("passes Library practice resume facts through the bridge", () => {
    const lastPosition = {
      measureId: "measure-7",
      measureIndex: 6,
      beatIndex: 1,
      tick: 12480,
      cachedTimeMs: 26000,
    };

    expect(
      bridgeResponseSchemas["library.list"].parse({
        scores: [
          {
            id: "00000000-0000-4000-8000-000000000001",
            scoreIdentity: hash,
            fileName: "practice.gp",
            format: "gp",
            title: "Practice",
            importedAt: "2026-07-26T08:00:00.000Z",
            isFavorite: false,
            practice: {
              hasLoop: true,
              lastPracticedAt: "2026-07-26T10:00:00.000Z",
              lastPosition,
            },
          },
        ],
      }).scores[0]?.practice,
    ).toEqual({
      hasLoop: true,
      lastPracticedAt: "2026-07-26T10:00:00.000Z",
      lastPosition,
    });
  });

  it("round-trips MusicXML identities through sidecar requests", () => {
    const identity = {
      contentHash: hash,
      format: "musicxml" as const,
      sourceHints: { fileName: "score.musicxml", trackNames: ["Piano"] },
    };
    expect(createBridgeRequest("sidecar.read", "sidecar-1", { identity }).payload.identity).toEqual(identity);
  });

  it("defines a capability-gated PDF OMR bridge without exposing paths", () => {
    const request = createBridgeRequest("pdfOmr.start", "pdf-start-1", {
      fileToken: "token-1",
      engineId: "rokot",
    });
    expect(request.type).toBe("pdfOmr.start");
    const retry = createBridgeRequest("pdfOmr.retry", "pdf-retry-1", {
      jobId: "job-1",
      engineId: "rokot",
    });
    expect(retry.type).toBe("pdfOmr.retry");
    expect(
      capabilitiesSchema.parse({
        pdfOmrWorkbench: true,
        pdfOmrEngines: [{ id: "audiveris", version: "host", available: true, inputKinds: ["pdf", "image"] }],
        fileAccess: { openExternalFile: true, persistentFileReferences: false, localLibraryImport: false },
        storage: { sqliteIndex: false, sidecarPayload: true },
        sync: { available: false, provider: "none" },
        audio: { webAudio: true, nativeBridge: false },
        localization: { changeLocale: true },
        externalNavigation: { openUrl: true },
      }).pdfOmrWorkbench,
    ).toBe(true);
    expect(
      parseBridgeResponse("pdfOmr.select", {
        status: "selected",
        fileToken: "token-1",
        fileName: "score.png",
        sizeBytes: 42,
        inputKind: "image",
      }),
    ).toMatchObject({ inputKind: "image" });
    expect(createBridgeRequest("pdfOmr.selectMidi", "midi-select-1", {}).type).toBe("pdfOmr.selectMidi");
    expect(
      createBridgeRequest("pdfOmr.analyzeMidi", "midi-analyze-1", {
        jobId: "job-1",
        fileToken: "midi-token-1",
      }).payload,
    ).toEqual({ jobId: "job-1", fileToken: "midi-token-1" });
    expect(
      createBridgeRequest("pdfOmr.applyMidiCorrections", "midi-apply-1", {
        jobId: "job-1",
        decisions: [{ proposalId: "proposal-1", writtenPitch: { step: "C", alter: 1, octave: 4 } }],
      }).payload.decisions,
    ).toHaveLength(1);
    expect(
      parseBridgeResponse("pdfOmr.analyzeMidi", {
        midiFileName: "reference.mid",
        compatibility: {
          status: "compatible",
          scoreCoverage: 1,
          midiCoverage: 1,
          pitchAgreement: 0.75,
        },
        proposals: [
          {
            id: "proposal-1",
            type: "pitch-disagreement",
            confidence: 0.9,
            reviewability: { status: "writeback-ready", reasons: [] },
            measureIndex: 0,
            before: { step: "C", alter: 0, octave: 4 },
            suggestedSoundingMidi: 61,
          },
        ],
      }),
    ).toMatchObject({ compatibility: { status: "compatible" } });
    expect(() =>
      parseBridgeResponse("pdfOmr.start", {
        jobId: "job-1",
        snapshot: {
          jobId: "job-1",
          status: "running",
          input: { fileName: "score.pdf", sizeBytes: 42, inputKind: "pdf" },
          error: { code: "INVALID_INPUT", recoverable: true, path: "/private/score.pdf" },
        },
      }),
    ).toThrow();
    expect(
      parseBridgeResponse("pdfOmr.start", {
        jobId: "job-1",
        snapshot: {
          jobId: "job-1",
          status: "failed",
          input: { fileName: "score.pdf", sizeBytes: 42, inputKind: "pdf" },
          error: { code: "INVALID_INPUT", recoverable: true, reason: "input-image-too-large" },
        },
      }).snapshot,
    ).toMatchObject({ error: { reason: "input-image-too-large" } });
    expect(() =>
      parseBridgeResponse("pdfOmr.start", {
        jobId: "job-1",
        snapshot: {
          jobId: "job-1",
          status: "failed",
          input: { fileName: "score.pdf", sizeBytes: 42, inputKind: "pdf" },
          error: { code: "INVALID_INPUT", recoverable: true, reason: "/private/leaked" },
        },
      }),
    ).toThrow();
  });

  it("exposes failed draft validation without result bytes", () => {
    expect(
      parseBridgeResponse("pdfOmr.readResult", {
        status: "failed-validation",
        validation: {
          readiness: { harmony: "blocked", musicXml: "blocked" },
          diagnostics: [{ code: "VOICE_DURATION_MISMATCH", severity: "blocking" }],
        },
      }),
    ).toMatchObject({
      status: "failed-validation",
      validation: { readiness: { harmony: "blocked" } },
    });
    expect(() =>
      parseBridgeResponse("pdfOmr.readResult", {
        status: "failed-validation",
        validation: {
          readiness: { harmony: "unknown", musicXml: "blocked" },
          diagnostics: [],
        },
      }),
    ).toThrow();
    expect(() =>
      parseBridgeResponse("pdfOmr.readResult", {
        status: "failed-validation",
        validation: {
          readiness: { harmony: "blocked", musicXml: "blocked" },
          diagnostics: [{ code: "VOICE_DURATION_MISMATCH", severity: "blocking", path: "/private/draft.json" }],
        },
      }),
    ).toThrow();
  });

  it("accepts an input preview request by job or by selected file token", () => {
    expect(
      createBridgeRequest("pdfOmr.readInputPreview", "preview-1", { jobId: "job-1", pageIndex: 0 }).payload,
    ).toEqual({ jobId: "job-1", pageIndex: 0 });
    expect(
      createBridgeRequest("pdfOmr.readInputPreview", "preview-2", { fileToken: "token-1", pageIndex: 0 }).payload,
    ).toEqual({ fileToken: "token-1", pageIndex: 0 });
    expect(() => createBridgeRequest("pdfOmr.readInputPreview", "preview-3", { pageIndex: 0 })).toThrow();
  });
});
