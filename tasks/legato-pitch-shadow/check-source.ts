import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { sha256Bytes } from "../../tools/pdf-omr-cli/src/canonical-json";
import { fillVoiceGapsWithRests } from "../../tools/pdf-omr-cli/src/draft-gap-fill";
import { normalizeAudiverisMusicXml } from "../../tools/pdf-omr-cli/src/normalizers/audiveris";
import { runPitchShadow } from "../../tools/pdf-omr-cli/src/run-pitch-shadow";
import { applySourcePitchCorrections } from "../../tools/pdf-omr-cli/src/apply-source-pitch-corrections";
import type { RecognitionProviderConfigurationStore } from "../../apps/desktop-shell/src/main/recognition/provider-configuration-store";

const [pdf, rawMusicXml, python, desktopOutput] = process.argv.slice(2);
if (!pdf || !rawMusicXml || !python) throw new Error("usage: check-source.ts <source.pdf> <raw.musicxml> <python>");
const draft = fillVoiceGapsWithRests(normalizeAudiverisMusicXml(await readFile(rawMusicXml)));
draft.provenance = {
  engine: { id: "legato", version: "raw-output-replay" },
  inputSha256: sha256Bytes(await readFile(pdf)),
};
const result = await runPitchShadow(resolve(pdf), draft, python);
const correction =
  result.source && result.report.extractorSha256
    ? await applySourcePitchCorrections(draft, result.source, result.report.extractorSha256)
    : undefined;
const counts = (reasons: string[]) =>
  reasons.reduce<Record<string, number>>((sum, reason) => {
    sum[reason] = (sum[reason] ?? 0) + 1;
    return sum;
  }, {});
let desktopReplay: unknown;
if (desktopOutput) {
  const { DesktopPdfOmrRuntime } = await import("../../apps/desktop-shell/src/main/recognition/pdf-omr-runtime");
  const { RecognitionProviderSettings } =
    await import("../../apps/desktop-shell/src/main/recognition/provider-settings");
  const settings = await RecognitionProviderSettings.create({
    store: {
      loadAll: async () => ({
        legato: {
          providerId: "legato",
          python,
          repository: "/replay",
          model: "/replay/model",
          baseModel: "/replay/base",
        },
      }),
    } as RecognitionProviderConfigurationStore,
    automaticAudiverisExecutable: "/unused",
  });
  const captured = settings.createRegistrySnapshot().get("legato");
  const bytes = await readFile(rawMusicXml);
  const runtime = new DesktopPdfOmrRuntime({
    standardFontDirectory: resolve("node_modules/pdfjs-dist/standard_fonts"),
    wasmDirectory: resolve("node_modules/pdfjs-dist/wasm"),
    engineRegistry: {
      get: () => ({
        ...captured,
        inspectEnvironment: async () => ({
          id: "legato",
          version: "raw-output-replay",
          executable: "replay",
          commandTemplate: [],
          license: { id: "development-replay", source: "existing-engine-artifact" },
        }),
        recognize: async () => ({
          normalizationBytes: bytes,
          nativeArtifacts: [{ relativePath: "converted.musicxml", bytes }],
          diagnostics: [],
          durationMs: 0,
        }),
        normalize: (raw) => fillVoiceGapsWithRests(normalizeAudiverisMusicXml(raw.normalizationBytes)),
      }),
    },
  });
  const pipeline = await runtime.run({
    inputPath: resolve(pdf),
    engineId: "legato",
    outputDirectory: resolve(desktopOutput),
  });
  const report = captured.pitchCorrectionPython
    ? JSON.parse(await readFile(join(desktopOutput, "recognition/pitch-correction/report.json"), "utf8"))
    : undefined;
  desktopReplay = {
    status: pipeline.status,
    outputSha256: pipeline.outputSha256,
    outcome: report?.outcome ?? "disabled",
    appliedCount: report?.appliedCount ?? 0,
    idle: !runtime.isRunning(),
  };
}
console.log(
  JSON.stringify(
    {
      inputSha256: draft.provenance.inputSha256,
      rawMusicXmlSha256: sha256Bytes(await readFile(rawMusicXml)),
      ...(desktopReplay === undefined ? {} : { desktopReplay }),
      draftMeasures: draft.parts.flatMap((part) =>
        part.staves.map((staff) => ({ part: part.id, staff: staff.index, count: staff.measures.length })),
      ),
      sourcePages: result.source?.pages.map((page) => ({
        reason: page.reason,
        measures: page.measures.length,
        heads: page.measures.reduce((sum, m) => sum + m.heads.length, 0),
      })),
      reason: result.report.reason,
      decisions: counts(result.report.decisions.map((d) => d.reason)),
      suggestions: result.report.suggestions,
      correction: correction ? { reason: correction.reason, appliedCount: correction.applied.length } : null,
      discrepancies: result.report.decisions
        .filter((d) => d.reason === "unanchored-discrepancy")
        .map((d) => {
          const staves = draft.parts.flatMap((part) => part.staves.map((staff) => ({ part, staff })));
          const slot = staves.findIndex(({ part, staff }) => part.id === d.partId && staff.index === d.staffIndex);
          const staff = staves[slot]!.staff;
          const ordinal = staff.measures.findIndex((m) => m.index === d.measureIndex);
          return {
            ...d,
            draft: staff.measures[ordinal],
            source: result.source?.pages.flatMap((p) => p.measures.filter((m) => m.staffIndex === slot))[ordinal],
          };
        }),
    },
    null,
    2,
  ),
);
