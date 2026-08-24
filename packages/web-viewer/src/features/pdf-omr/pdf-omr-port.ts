import type { PdfOmrJobSnapshot, RecognitionHistoryPage, RecognitionJobDetail } from "@zupulse/web-core";

export type RecognitionConnectionState = "connecting" | "connected" | "reconnecting";

export type PdfOmrEngineOption = {
  id: string;
  version: string;
  label: string;
  available: boolean;
  inputKinds: readonly ("pdf" | "image")[];
  reason?: string;
};

export type PdfOmrValidationView = {
  readiness: {
    harmony: "blocked" | "ready-with-warnings" | "ready";
    musicXml: "blocked" | "ready-with-warnings" | "ready";
  };
  diagnostics: readonly { code: string; severity: "blocking" | "warning" | "info" }[];
};

export type PdfOmrResult = {
  fileName: string;
  bytes: Uint8Array;
  outputSha256: string;
  validation: PdfOmrValidationView;
};

export type PdfOmrWrittenPitch = {
  step: "A" | "B" | "C" | "D" | "E" | "F" | "G";
  alter: -2 | -1 | 0 | 1 | 2;
  octave: number;
};

export type PdfOmrMidiAnalysis = {
  midiFileName: string;
  compatibility: {
    status: "compatible" | "ambiguous" | "incompatible";
    scoreCoverage: number;
    midiCoverage: number;
    pitchAgreement: number;
  };
  proposals: readonly {
    id: string;
    type: "pitch-disagreement" | "midi-supported-missing-note" | "unsupported-score-note";
    confidence: number;
    reviewability: { status: "writeback-ready" | "review-only"; reasons: readonly string[] };
    measureIndex?: number;
    before?: PdfOmrWrittenPitch;
    suggestedSoundingMidi?: number;
  }[];
};

export type PdfOmrInputPreview = {
  pageIndex: number;
  pageCount: number;
  contentType: "image/png" | "image/jpeg";
  bytes: Uint8Array;
};

export type RecognitionJobPort = {
  engines: readonly PdfOmrEngineOption[];
  select(): Promise<
    | { status: "cancelled" }
    | {
        status: "selected";
        fileToken: string;
        fileName: string;
        sizeBytes: number;
        inputKind: "pdf" | "image";
      }
  >;
  start(fileToken: string, engineId: string): Promise<{ jobId: string; snapshot: PdfOmrJobSnapshot }>;
  retry(jobId: string, engineId: string): Promise<{ jobId: string; snapshot: PdfOmrJobSnapshot }>;
  cancel(jobId: string): Promise<void>;
  cancelPendingStart?(): void;
  getSnapshot(): Promise<PdfOmrJobSnapshot | null>;
  getDetail?(): Promise<RecognitionJobDetail | null>;
  readResult(jobId: string): Promise<PdfOmrResult | null>;
  readFailedValidation(jobId: string): Promise<PdfOmrValidationView | null>;
  readInputPreview?(jobId: string, pageIndex: number): Promise<PdfOmrInputPreview | null>;
  exportResult(jobId: string): Promise<"saved" | "cancelled">;
  subscribe(listener: (snapshot: PdfOmrJobSnapshot) => void): () => void;
  subscribeConnection?(listener: (state: RecognitionConnectionState) => void): () => void;
};

export type RecognitionHistoryPort = {
  list(input: { cursor?: string; limit: number }): Promise<RecognitionHistoryPage>;
  create(): RecognitionJobPort;
  open(jobId: string): RecognitionJobPort;
  delete(jobId: string): Promise<void>;
};

export type PdfOmrMidiCorrectionPort = {
  selectMidi(): Promise<
    { status: "cancelled" } | { status: "selected"; fileToken: string; fileName: string; sizeBytes: number }
  >;
  analyzeMidi(jobId: string, fileToken: string): Promise<PdfOmrMidiAnalysis>;
  applyMidiCorrections(
    jobId: string,
    decisions: readonly { proposalId: string; writtenPitch: PdfOmrWrittenPitch }[],
  ): Promise<{ appliedCount: number }>;
};

export type PdfOmrWorkbenchPort = RecognitionJobPort & PdfOmrMidiCorrectionPort;
