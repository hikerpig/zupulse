import {
  PdfOmrError,
  runPdfOmrPipeline,
  type EngineRegistry,
  type PdfOmrPipelineRequest,
  type PdfOmrPipelineResult,
} from "@zupulse/pdf-omr-cli/pipeline";
import { join } from "node:path";

type PipelineRunner = (request: PdfOmrPipelineRequest) => Promise<PdfOmrPipelineResult>;

export class DesktopPdfOmrRuntime {
  private active: { controller: AbortController; operation: Promise<PdfOmrPipelineResult> } | undefined;
  private readonly runPipeline: PipelineRunner;
  private readonly standardFontDirectory: string;
  private readonly wasmDirectory: string;
  private readonly engineRegistry: EngineRegistry | undefined;
  private readonly engineRegistryProvider: (() => EngineRegistry) | undefined;

  constructor(
    options: {
      runPipeline?: PipelineRunner;
      standardFontDirectory?: string;
      wasmDirectory?: string;
      engineRegistry?: EngineRegistry;
      engineRegistryProvider?: () => EngineRegistry;
    } = {},
  ) {
    this.runPipeline = options.runPipeline ?? runPdfOmrPipeline;
    this.standardFontDirectory = options.standardFontDirectory ?? join(__dirname, "pdfjs-standard-fonts");
    this.wasmDirectory = options.wasmDirectory ?? join(__dirname, "pdfjs-wasm");
    this.engineRegistry = options.engineRegistry;
    this.engineRegistryProvider = options.engineRegistryProvider;
  }

  isRunning(): boolean {
    return this.active !== undefined;
  }

  async run(
    request: Omit<PdfOmrPipelineRequest, "signal" | "standardFontDirectory" | "wasmDirectory">,
  ): Promise<PdfOmrPipelineResult> {
    if (this.active !== undefined) {
      throw new PdfOmrError("INVALID_INPUT", "a PDF OMR pipeline is already active", {
        context: { reason: "pipeline-active" },
      });
    }
    const controller = new AbortController();
    const engineRegistry = this.engineRegistryProvider?.() ?? this.engineRegistry;
    const operation = this.runPipeline({
      ...request,
      standardFontDirectory: this.standardFontDirectory,
      wasmDirectory: this.wasmDirectory,
      ...(engineRegistry === undefined ? {} : { engineRegistry }),
      signal: controller.signal,
    });
    this.active = { controller, operation };
    try {
      return await operation;
    } finally {
      if (this.active?.operation === operation) this.active = undefined;
    }
  }

  cancel(): void {
    this.active?.controller.abort();
  }
}
