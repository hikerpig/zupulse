import type { OmrScoreDraft } from "../schemas";

export type OmrEngineEnvironment = {
  id: string;
  version: string;
  executable: string;
  modelSha256?: string;
  parameters?: Readonly<Record<string, string | number | boolean>>;
  commandTemplate: readonly string[];
  license: {
    id: string;
    source: string;
  };
};

export type OmrRecognitionRequest = {
  inputPath: string;
  outputDirectory: string;
  signal?: AbortSignal;
};

export type OmrRawRecognition = {
  normalizationBytes: Uint8Array;
  nativeArtifacts: readonly {
    relativePath: string;
    bytes: Uint8Array;
  }[];
  diagnostics: OmrScoreDraft["diagnostics"];
  durationMs: number;
};

export type OmrEngineAdapter = {
  inspectEnvironment(signal?: AbortSignal): Promise<OmrEngineEnvironment>;
  recognize(request: OmrRecognitionRequest): Promise<OmrRawRecognition>;
  normalize(recognition: OmrRawRecognition): OmrScoreDraft;
};
