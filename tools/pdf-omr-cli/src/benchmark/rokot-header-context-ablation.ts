import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { canonicalJson, sha256Bytes } from "../canonical-json";
import { createRokotAdapter, type RokotAdapterOptions } from "../engines/rokot";
import {
  parsePreviousSystemHeaders,
  ROKOT_SYSTEM_CONTEXT_POLICIES,
  type PreviousSystemHeaders,
  type RokotSystemContextPolicy,
} from "../engines/rokot-system-context";
import { PdfOmrError } from "../errors";
import { parseRokotSystemBundle } from "../normalizers/rokot";
import { normalizeAudiverisMusicXml } from "../normalizers/audiveris";
import { encodeRgbaPagesAsPdf } from "../raster-pdf";
import { renderPdfPages } from "../render-pdf-pages";
import type { OmrScoreDraft } from "../schemas";
import { segmentStaffSystems } from "../staff-system-segmentation";
import { validateDraft } from "../validate-draft";
import { alignDraftParts } from "./part-identity";
import { computeSymbolicMetrics, type SymbolicMetrics } from "./symbolic-metrics";

export const ROKOT_HEADER_CONTEXT_BASELINE: RokotSystemContextPolicy = "previous-prediction-headers-v1";

export type HeaderContextWorkSpec = {
  id: string;
  category: string;
  inputPath: string;
  groundTruthPath: string;
  staffLayout: "single-staff" | "grand-staff";
  allowFragmentedRuns: boolean;
  pairAdjacentUnpairedGroups?: boolean;
};

export type SymbolicSnapshot = {
  pitchF1: number;
  onsetF1: number;
  durationF1: number;
  jointF1: number;
  staffF1: number;
  voiceF1: number;
  tieF1: number;
  tupletF1: number;
  validMeasures: number;
  validMeasureTotal: number;
  validMeasureRate: number;
};

export type PredictedSystemHeaders = {
  pageIndex: number;
  systemIndex: number;
  headers: PreviousSystemHeaders | { status: "unsafe" };
};

export type HeaderContextVariantObservation = {
  policy: RokotSystemContextPolicy;
  draftSha256: string;
  elapsedMs: number;
  modelUnitCount: number;
  measuresPerStaff: number[];
  predictedHeaders: PredictedSystemHeaders[];
  predictedKeys: string[];
  rawDiagnosticCount: number;
  rawDiagnosticsByCode: Record<string, number>;
  validatedDiagnosticCount: number;
  validatedDiagnosticsByCode: Record<string, number>;
  readiness: { harmony: string; musicXml: string };
  symbolic: SymbolicSnapshot;
};

export type HeaderContextWorkObservation = {
  work: {
    id: string;
    category: string;
    inputSha256: string;
    groundTruthSha256: string;
    staffLayout: "single-staff" | "grand-staff";
  };
  materialization: {
    detectorAllowFragmentedRuns: boolean;
    pairAdjacentUnpairedGroups?: boolean;
    systemCount: number;
    systemsPerPage: number[];
    derivedPdfSha256: string;
  };
  groundTruth: {
    measuresPerStaff: number[];
    readiness: { harmony: string; musicXml: string };
    diagnosticCodes: string[];
  };
  variants: Record<string, HeaderContextVariantObservation>;
};

export function snapshotSymbolicMetrics(metrics: SymbolicMetrics): SymbolicSnapshot {
  return {
    pitchF1: metrics.pitch.f1,
    onsetF1: metrics.onset.f1,
    durationF1: metrics.duration.f1,
    jointF1: metrics.joint.f1,
    staffF1: metrics.staff.f1,
    voiceF1: metrics.voice.f1,
    tieF1: metrics.tie.f1,
    tupletF1: metrics.tuplet.f1,
    validMeasures: metrics.validMeasure.valid,
    validMeasureTotal: metrics.validMeasure.total,
    validMeasureRate: metrics.validMeasure.rate,
  };
}

export function countDiagnosticsByCode(diagnostics: readonly { code: string }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const diagnostic of diagnostics) {
    counts[diagnostic.code] = (counts[diagnostic.code] ?? 0) + 1;
  }
  return counts;
}

export function uniquePredictedKeys(headers: readonly PredictedSystemHeaders[]): string[] {
  const keys = new Set<string>();
  for (const entry of headers) {
    if ("key" in entry.headers) keys.add(entry.headers.key);
  }
  return [...keys];
}

export async function materializeHeaderContextSystems(
  spec: HeaderContextWorkSpec,
  outputPdfPath: string,
): Promise<{
  systemCount: number;
  systemsPerPage: number[];
  derivedPdfSha256: string;
  cropSha256s: string[];
}> {
  const sourceBytes = await readFile(spec.inputPath);
  const pages = await renderPdfPages(sourceBytes, { targetWidth: 1400, allowLandscape: true });
  const segmentation = segmentStaffSystems(pages, {
    allowFragmentedRuns: spec.allowFragmentedRuns,
    staffLayout: spec.staffLayout,
    ...(spec.pairAdjacentUnpairedGroups === true ? { pairAdjacentUnpairedGroups: true } : {}),
  });
  const systems = [...segmentation.systems].sort(
    (left, right) => left.pageIndex - right.pageIndex || left.systemIndex - right.systemIndex,
  );
  if (systems.length < 2) {
    throw new PdfOmrError("ENGINE_OUTPUT_INVALID", "header-context ablation requires at least two systems", {
      context: { workId: spec.id, systemCount: systems.length },
    });
  }
  const pageCount = Math.max(...systems.map((system) => system.pageIndex)) + 1;
  const systemsPerPage = Array.from(
    { length: pageCount },
    (_, pageIndex) => systems.filter((system) => system.pageIndex === pageIndex).length,
  );
  const pdfBytes = encodeRgbaPagesAsPdf(
    systems.map((system) => ({
      width: system.pixelBBox.width,
      height: system.pixelBBox.height,
      pixels: system.cropPixels,
    })),
  );
  await mkdir(join(outputPdfPath, ".."), { recursive: true });
  await writeFile(outputPdfPath, pdfBytes, { flag: "wx" });
  return {
    systemCount: systems.length,
    systemsPerPage,
    derivedPdfSha256: sha256Bytes(pdfBytes),
    cropSha256s: systems.map((system) => system.cropSha256),
  };
}

export async function evaluateRokotHeaderContextWork(input: {
  spec: HeaderContextWorkSpec;
  outputDirectory: string;
  rokot: RokotAdapterOptions;
  policies?: readonly RokotSystemContextPolicy[];
}): Promise<HeaderContextWorkObservation> {
  const policies = input.policies ?? ROKOT_SYSTEM_CONTEXT_POLICIES;
  const workDirectory = join(input.outputDirectory, input.spec.id);
  await mkdir(workDirectory, { recursive: true });
  const sourceBytes = await readFile(input.spec.inputPath);
  const groundTruthBytes = await readFile(input.spec.groundTruthPath);
  const expected = normalizeAudiverisMusicXml(groundTruthBytes);
  const groundTruthValidation = validateDraft(expected);
  const materialization = await materializeHeaderContextSystems(
    input.spec,
    join(workDirectory, "verified-systems.pdf"),
  );
  const variants: Record<string, HeaderContextVariantObservation> = {};
  for (const policy of policies) {
    process.stderr.write(`  policy ${policy}\n`);
    const variantDirectory = join(workDirectory, policy);
    await mkdir(variantDirectory, { recursive: true });
    const adapter = createRokotAdapter({ ...input.rokot, systemContextPolicy: policy });
    const started = performance.now();
    const recognition = await adapter.recognize({
      inputPath: join(workDirectory, "verified-systems.pdf"),
      outputDirectory: join(variantDirectory, "engine"),
      inputScope: "system-crop",
      staffLayout: input.spec.staffLayout,
    });
    const draft = adapter.normalize(recognition);
    const bundle = parseRokotSystemBundle(recognition.normalizationBytes);
    const validation = validateDraft(draft);
    const aligned = alignDraftParts(draft, expected);
    const predictedHeaders = bundle.systems.map((system) => ({
      pageIndex: system.pageIndex,
      systemIndex: system.systemIndex,
      headers: parsePreviousSystemHeaders(system.abcUtf8) ?? { status: "unsafe" as const },
    }));
    variants[policy] = {
      policy,
      draftSha256: sha256Bytes(new TextEncoder().encode(canonicalJson(draft))),
      elapsedMs: Math.round(performance.now() - started),
      modelUnitCount: bundle.systems.length,
      measuresPerStaff: measuresPerStaff(draft),
      predictedHeaders,
      predictedKeys: uniquePredictedKeys(predictedHeaders),
      rawDiagnosticCount: draft.diagnostics.length,
      rawDiagnosticsByCode: countDiagnosticsByCode(draft.diagnostics),
      validatedDiagnosticCount: validation.diagnostics.length,
      validatedDiagnosticsByCode: countDiagnosticsByCode(validation.diagnostics),
      readiness: validation.readiness,
      symbolic: snapshotSymbolicMetrics(computeSymbolicMetrics(aligned.draft, expected)),
    };
  }
  return {
    work: {
      id: input.spec.id,
      category: input.spec.category,
      inputSha256: sha256Bytes(sourceBytes),
      groundTruthSha256: sha256Bytes(groundTruthBytes),
      staffLayout: input.spec.staffLayout,
    },
    materialization: {
      detectorAllowFragmentedRuns: input.spec.allowFragmentedRuns,
      ...(input.spec.pairAdjacentUnpairedGroups === true ? { pairAdjacentUnpairedGroups: true } : {}),
      systemCount: materialization.systemCount,
      systemsPerPage: materialization.systemsPerPage,
      derivedPdfSha256: materialization.derivedPdfSha256,
    },
    groundTruth: {
      measuresPerStaff: measuresPerStaff(expected),
      readiness: groundTruthValidation.readiness,
      diagnosticCodes: [...new Set(groundTruthValidation.diagnostics.map((diagnostic) => diagnostic.code))].sort(),
    },
    variants,
  };
}

function measuresPerStaff(draft: OmrScoreDraft): number[] {
  return draft.parts.flatMap((part) => part.staves.map((staff) => staff.measures.length));
}
