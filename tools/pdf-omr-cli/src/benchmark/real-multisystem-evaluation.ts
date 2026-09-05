import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { sha256Schema } from "../schemas";
import { rokotJoiningEvidenceSchema } from "./rokot-joining-evidence";

export const realMultiSystemCaseSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    caseId: z.string().min(1),
    corpusId: z.string().min(1),
    itemId: z.string().min(1),
    engineId: z.literal("rokot"),
    source: z
      .object({
        inputSha256: sha256Schema,
        groundTruthSha256: sha256Schema,
        mappingSha256: sha256Schema,
      })
      .strict(),
    groundTruthPolicy: z.literal("evaluation-only"),
    expected: z
      .object({
        pageCount: z.number().int().positive(),
        systemCount: z.number().int().min(2),
        minimumSystemCount: z.number().int().min(2),
      })
      .strict(),
  })
  .strict()
  .refine((value) => value.expected.minimumSystemCount <= value.expected.systemCount, {
    message: "minimumSystemCount cannot exceed systemCount",
    path: ["expected", "minimumSystemCount"],
  });

export type RealMultiSystemCase = z.infer<typeof realMultiSystemCaseSchema>;

const failureObservationSchema = z
  .object({
    itemId: z.string().min(1),
    status: z.literal("failed"),
    error: z
      .object({
        code: z.string().min(1),
        reason: z.string().min(1).optional(),
        stage: z.string().min(1).optional(),
        pageIndex: z.number().int().nonnegative().optional(),
      })
      .strict(),
  })
  .strict();

const successObservationSchema = z
  .object({
    itemId: z.string().min(1),
    status: z.literal("succeeded"),
    symbolic: z
      .object({
        jointF1: z.number().min(0).max(1),
        validMeasureRate: z.number().min(0).max(1),
      })
      .strict(),
    musicXml: z.object({ parse: z.boolean(), structural: z.boolean() }).strict(),
  })
  .strict();

const evaluationObservationSchema = z
  .object({
    corpusId: z.string().min(1),
    engineId: z.string().min(1),
    item: z.discriminatedUnion("status", [failureObservationSchema, successObservationSchema]),
    joiningEvidence: z.unknown().optional(),
    source: z
      .object({
        inputSha256: sha256Schema,
        groundTruthSha256: sha256Schema.optional(),
        mappingSha256: sha256Schema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type RealMultiSystemEvaluationObservation = z.input<typeof evaluationObservationSchema>;

const persistedReportSchema = z
  .object({
    metadata: z.object({ corpusId: z.string().min(1), engineId: z.string().min(1) }).passthrough(),
  })
  .passthrough();

const predictedDraftProvenanceSchema = z
  .object({
    provenance: z.object({ inputSha256: sha256Schema }).passthrough(),
  })
  .passthrough();

const persistedSuccessSchema = z
  .object({
    itemId: z.string().min(1),
    status: z.literal("succeeded"),
    symbolic: z
      .object({
        joint: z.object({ f1: z.number().min(0).max(1) }).passthrough(),
        validMeasure: z.object({ rate: z.number().min(0).max(1) }).passthrough(),
      })
      .passthrough(),
    runtime: z.object({ parse: z.boolean(), structural: z.boolean() }).passthrough(),
  })
  .passthrough();

const persistedFailureSchema = z
  .object({
    itemId: z.string().min(1),
    status: z.literal("failed"),
    error: z
      .object({
        code: z.string().min(1),
        context: z
          .object({
            reason: z.string().min(1).optional(),
            stage: z.string().min(1).optional(),
            pageIndex: z.number().int().nonnegative().optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough(),
  })
  .passthrough();

type EvaluationResult =
  | {
      schemaVersion: "1.0.0";
      caseId: string;
      itemId: string;
      status: "NOT_EVALUATED";
      reason:
        | "observation-identity-mismatch"
        | "source-hash-mismatch"
        | "missing-source-hashes"
        | "engine-item-failed"
        | "missing-joining-artifact"
        | "invalid-joining-artifact"
        | "multi-system-admission-failed";
      error?: { code: string; reason?: string; stage?: string; pageIndex?: number };
      checks?: Record<string, boolean>;
      observed?: MultiSystemObserved;
      quality?: MultiSystemQuality;
    }
  | {
      schemaVersion: "1.0.0";
      caseId: string;
      itemId: string;
      status: "EVALUATED";
      checks: Record<string, true>;
      observed: MultiSystemObserved;
      quality: MultiSystemQuality;
    };

type MultiSystemObserved = {
  pageCount: number;
  systemCount: number;
  normalizedMeasureCount: number;
  normalizedSourceCoverage: number;
};

type MultiSystemQuality = {
  jointF1: number;
  validMeasureRate: number;
};

export async function evaluateRealMultiSystemRun(
  caseInput: RealMultiSystemCase,
  runDirectory: string,
): Promise<EvaluationResult> {
  const caseDefinition = realMultiSystemCaseSchema.parse(caseInput);
  const report = persistedReportSchema.parse(JSON.parse(await readFile(join(runDirectory, "report.json"), "utf8")));
  const itemDirectory = join(runDirectory, "items", caseDefinition.itemId);
  const resultBytes = await readFile(join(itemDirectory, "result.json"), "utf8").catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  });
  if (resultBytes === undefined) {
    const failure = persistedFailureSchema.parse(JSON.parse(await readFile(join(itemDirectory, "error.json"), "utf8")));
    return evaluateRealMultiSystemCase(caseDefinition, {
      corpusId: report.metadata.corpusId,
      engineId: report.metadata.engineId,
      item: {
        itemId: failure.itemId,
        status: "failed",
        error: {
          code: failure.error.code,
          ...(failure.error.context?.reason === undefined ? {} : { reason: failure.error.context.reason }),
          ...(failure.error.context?.stage === undefined ? {} : { stage: failure.error.context.stage }),
          ...(failure.error.context?.pageIndex === undefined ? {} : { pageIndex: failure.error.context.pageIndex }),
        },
      },
    });
  }

  const result = persistedSuccessSchema.parse(JSON.parse(resultBytes));
  const joiningEvidence = await readFile(join(itemDirectory, "joining.json"), "utf8")
    .then((value) => JSON.parse(value) as unknown)
    .catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    });
  const predictedDraftBytes = await readFile(join(itemDirectory, "predicted-draft.json"), "utf8").catch(
    (error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    },
  );
  const predictedDraft =
    predictedDraftBytes === undefined
      ? undefined
      : predictedDraftProvenanceSchema.safeParse(JSON.parse(predictedDraftBytes));
  return evaluateRealMultiSystemCase(caseDefinition, {
    corpusId: report.metadata.corpusId,
    engineId: report.metadata.engineId,
    item: {
      itemId: result.itemId,
      status: "succeeded",
      symbolic: {
        jointF1: result.symbolic.joint.f1,
        validMeasureRate: result.symbolic.validMeasure.rate,
      },
      musicXml: { parse: result.runtime.parse, structural: result.runtime.structural },
    },
    ...(joiningEvidence === undefined ? {} : { joiningEvidence }),
    ...(predictedDraft?.success === true
      ? { source: { inputSha256: predictedDraft.data.provenance.inputSha256 } }
      : {}),
  });
}

export function evaluateRealMultiSystemCase(
  caseInput: RealMultiSystemCase,
  observationInput: RealMultiSystemEvaluationObservation,
): EvaluationResult {
  const caseDefinition = realMultiSystemCaseSchema.parse(caseInput);
  const observation = evaluationObservationSchema.parse(observationInput);
  const base = {
    schemaVersion: "1.0.0" as const,
    caseId: caseDefinition.caseId,
    itemId: caseDefinition.itemId,
  };

  if (
    observation.corpusId !== caseDefinition.corpusId ||
    observation.engineId !== caseDefinition.engineId ||
    observation.item.itemId !== caseDefinition.itemId
  ) {
    return { ...base, status: "NOT_EVALUATED", reason: "observation-identity-mismatch" };
  }
  if (observation.item.status === "succeeded") {
    if (observation.source === undefined) {
      return { ...base, status: "NOT_EVALUATED", reason: "missing-source-hashes" };
    }
    if (
      observation.source.inputSha256 !== caseDefinition.source.inputSha256 ||
      (observation.source.groundTruthSha256 !== undefined &&
        observation.source.groundTruthSha256 !== caseDefinition.source.groundTruthSha256) ||
      (observation.source.mappingSha256 !== undefined &&
        observation.source.mappingSha256 !== caseDefinition.source.mappingSha256)
    ) {
      return { ...base, status: "NOT_EVALUATED", reason: "source-hash-mismatch" };
    }
  }
  if (observation.item.status === "failed") {
    return {
      ...base,
      status: "NOT_EVALUATED",
      reason: "engine-item-failed",
      error: {
        code: observation.item.error.code,
        ...(observation.item.error.reason === undefined ? {} : { reason: observation.item.error.reason }),
        ...(observation.item.error.stage === undefined ? {} : { stage: observation.item.error.stage }),
        ...(observation.item.error.pageIndex === undefined ? {} : { pageIndex: observation.item.error.pageIndex }),
      },
    };
  }
  if (observation.joiningEvidence === undefined) {
    return { ...base, status: "NOT_EVALUATED", reason: "missing-joining-artifact" };
  }

  const parsedEvidence = rokotJoiningEvidenceSchema.safeParse(observation.joiningEvidence);
  if (!parsedEvidence.success) {
    return { ...base, status: "NOT_EVALUATED", reason: "invalid-joining-artifact" };
  }
  const evidence = parsedEvidence.data;
  const pageCount = new Set(evidence.systems.map((system) => system.source.pageIndex)).size;
  const sourcedBoundaries = evidence.normalizedMeasureBoundaries.filter(
    (boundary) => boundary.source !== undefined,
  ).length;
  const observed = {
    pageCount,
    systemCount: evidence.systems.length,
    normalizedMeasureCount: evidence.normalizedMeasureCount,
    normalizedSourceCoverage:
      evidence.normalizedMeasureCount === 0 ? 0 : sourcedBoundaries / evidence.normalizedMeasureCount,
  };
  const quality = {
    jointF1: observation.item.symbolic.jointF1,
    validMeasureRate: observation.item.symbolic.validMeasureRate,
  };
  const checks = {
    minimumSystemCount: observed.systemCount >= caseDefinition.expected.minimumSystemCount,
    expectedSystemCount: observed.systemCount === caseDefinition.expected.systemCount,
    expectedPageCount: observed.pageCount === caseDefinition.expected.pageCount,
    hasRawMeasureBoundaries: evidence.rawMeasureBoundaries.length > 0,
    hasNormalizedMeasures: observed.normalizedMeasureCount > 0,
    completeNormalizedSourceCoverage: observed.normalizedSourceCoverage === 1,
    musicXmlParse: observation.item.musicXml.parse,
    musicXmlStructuralAgreement: observation.item.musicXml.structural,
  };
  if (Object.values(checks).some((passed) => !passed)) {
    return {
      ...base,
      status: "NOT_EVALUATED",
      reason: "multi-system-admission-failed",
      checks,
      observed,
      quality,
    };
  }
  return {
    ...base,
    status: "EVALUATED",
    checks: checks as Record<string, true>,
    observed,
    quality,
  };
}
