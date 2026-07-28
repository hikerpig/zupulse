export type OmrEngineEnvironment = {
  id: string;
  version: string;
  executable: string;
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
  musicXmlBytes: Uint8Array;
  omrBytes: Uint8Array;
  durationMs: number;
};

export type OmrEngineAdapter = {
  inspectEnvironment(signal?: AbortSignal): Promise<OmrEngineEnvironment>;
  recognize(request: OmrRecognitionRequest): Promise<OmrRawRecognition>;
};
