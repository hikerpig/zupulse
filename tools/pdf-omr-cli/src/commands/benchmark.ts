import { PdfOmrError } from "../errors";
import { runBenchmark, type RunBenchmarkDependencies } from "../benchmark/run-benchmark";
import { pdfOmrBenchmarkReportSchema, type PdfOmrBenchmarkReport } from "../schemas";

export async function benchmarkCommand(
  manifestPath: string,
  engineId: string,
  outputDirectory: string,
  options: {
    mode: "development" | "holdout";
    preprocess: string;
    protocolSha256?: string;
    signal?: AbortSignal;
  },
  dependencies: RunBenchmarkDependencies = {},
): Promise<PdfOmrBenchmarkReport> {
  const { report, reportSha256 } = await runBenchmark(
    {
      manifestPath,
      engineId,
      outputDirectory,
      mode: options.mode,
      preprocess: options.preprocess,
      ...(options.protocolSha256 === undefined ? {} : { protocolSha256: options.protocolSha256 }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    },
    dependencies,
  );
  if (report.gate.evaluated && !report.gate.passed) {
    throw new PdfOmrError("BENCHMARK_GATE_FAILED", "frozen benchmark gate failed", {
      context: {
        decision: report.gate.decision,
        reportSha256,
      },
    });
  }
  return pdfOmrBenchmarkReportSchema.parse({
    schemaVersion: "1.0.0",
    command: "benchmark",
    status: "succeeded",
    reportSha256,
    gateEvaluated: report.gate.evaluated,
    ...(report.gate.evaluated ? { gatePassed: report.gate.passed } : {}),
  });
}
