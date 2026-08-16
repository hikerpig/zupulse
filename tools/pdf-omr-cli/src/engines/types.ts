import type { OmrScoreDraft } from "../schemas";
import type { StaffLayout } from "../staff-system-segmentation";
import type { ProcessResourceUsage } from "../resource-metrics";

export type OmrEngineEnvironment = {
  id: string;
  version: string;
  executable: string;
  modelSha256?: string;
  parameters?: Readonly<Record<string, string | number | boolean>>;
  commandTemplate: readonly string[];
  inputKinds?: readonly ("pdf" | "image")[];
  license: {
    id: string;
    source: string;
  };
};

export type OmrRecognitionRequest = {
  inputPath: string;
  outputDirectory: string;
  inputScope?: "system-crop" | "full-page";
  standardFontDirectory?: string;
  wasmDirectory?: string;
  staffLayout?: StaffLayout;
  signal?: AbortSignal;
  onProgress?: (progress: OmrEngineProgress) => void;
};

export type OmrEngineProgress = {
  unit: "page" | "system";
  completed: number;
  total: number;
};

export type DecoderTermination = "eos" | "max-length" | "other";

export type DecoderPageTelemetry = {
  pageNumber: number;
  outputTokenCount: number;
  maxLength: number;
  termination: DecoderTermination;
  device: string;
  dtype: string;
  contextPrefixSha256?: string;
};

export type DecoderTelemetry = {
  schemaVersion: "1.0.0";
  pages: readonly DecoderPageTelemetry[];
  workerRequests?: readonly {
    warm: boolean;
    requestDurationMs: number;
    modelLoadMs?: number;
  }[];
};

export type OmrRawRecognition = {
  normalizationBytes: Uint8Array;
  nativeArtifacts: readonly {
    relativePath: string;
    bytes: Uint8Array;
  }[];
  diagnostics: OmrScoreDraft["diagnostics"];
  durationMs: number;
  resourceUsage?: ProcessResourceUsage;
  decoderTelemetry?: DecoderTelemetry;
};

export type OmrEngineAdapter = {
  inspectEnvironment(signal?: AbortSignal): Promise<OmrEngineEnvironment>;
  recognize(request: OmrRecognitionRequest): Promise<OmrRawRecognition>;
  normalize(recognition: OmrRawRecognition): OmrScoreDraft;
  close?(): Promise<void>;
};
