import { z } from "zod";
import { parseMusicXmlDocument, childElements } from "../normalizers/musicxml-source";
import type { RokotSystemBundle } from "../normalizers/rokot";
import type { OmrScoreDraft } from "../schemas";

const sourceSchema = z
  .object({
    pageIndex: z.number().int().nonnegative(),
    systemIndex: z.number().int().nonnegative(),
    cropSha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

const systemSchema = z
  .object({
    source: sourceSchema,
    localMeasureCount: z.number().int().nonnegative(),
    localMeasureNumbers: z.record(z.string(), z.array(z.string())),
    rawGlobalMeasureStart: z.number().int().nonnegative(),
    rawGlobalMeasureEnd: z.number().int().nonnegative(),
  })
  .strict();

const boundarySchema = z
  .object({
    globalMeasureIndex: z.number().int().nonnegative(),
    source: sourceSchema,
    localMeasureIndex: z.number().int().nonnegative(),
  })
  .strict();

const normalizedBoundarySchema = z
  .object({
    globalMeasureIndex: z.number().int().nonnegative(),
    source: sourceSchema.optional(),
  })
  .strict();

export const rokotJoiningEvidenceSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    normalizedMeasureCount: z.number().int().nonnegative(),
    systems: z.array(systemSchema).min(1),
    rawMeasureBoundaries: z.array(boundarySchema),
    normalizedMeasureBoundaries: z.array(normalizedBoundarySchema),
  })
  .strict()
  .superRefine((evidence, context) => {
    for (let index = 1; index < evidence.systems.length; index += 1) {
      const previous = evidence.systems[index - 1]!.source;
      const current = evidence.systems[index]!.source;
      const ordered =
        current.pageIndex > previous.pageIndex ||
        (current.pageIndex === previous.pageIndex && current.systemIndex > previous.systemIndex);
      if (!ordered) {
        context.addIssue({
          code: "custom",
          path: ["systems", index, "source"],
          message: "systems must be unique and ordered by pageIndex and systemIndex",
        });
      }
    }
  });

export type RokotJoiningEvidence = z.infer<typeof rokotJoiningEvidenceSchema>;

export type RokotJoiningEvidenceSummary = {
  readonly artifacts: number;
  readonly singleSystemArtifacts: number;
  readonly multiSystemArtifacts: number;
  readonly systems: number;
  readonly rawMeasureBoundaries: number;
  readonly normalizedMeasureBoundaries: number;
  readonly normalizedBoundariesWithoutSource: number;
};

export function summarizeRokotJoiningEvidence(inputs: readonly RokotJoiningEvidence[]): RokotJoiningEvidenceSummary {
  const evidence = inputs.map((input) => rokotJoiningEvidenceSchema.parse(input));
  return {
    artifacts: evidence.length,
    singleSystemArtifacts: evidence.filter((item) => item.systems.length === 1).length,
    multiSystemArtifacts: evidence.filter((item) => item.systems.length > 1).length,
    systems: evidence.reduce((total, item) => total + item.systems.length, 0),
    rawMeasureBoundaries: evidence.reduce((total, item) => total + item.rawMeasureBoundaries.length, 0),
    normalizedMeasureBoundaries: evidence.reduce((total, item) => total + item.normalizedMeasureBoundaries.length, 0),
    normalizedBoundariesWithoutSource: evidence.reduce(
      (total, item) =>
        total + item.normalizedMeasureBoundaries.filter((boundary) => boundary.source === undefined).length,
      0,
    ),
  };
}

export function buildRokotJoiningEvidence(bundle: RokotSystemBundle, draft: OmrScoreDraft): RokotJoiningEvidence {
  let globalMeasureStart = 0;
  const systems = bundle.systems.map((system) => {
    const localMeasureNumbers = readMeasureNumbers(system.musicXmlUtf8);
    const localMeasureCount = Math.max(0, ...Object.values(localMeasureNumbers).map((numbers) => numbers.length));
    const evidence = {
      source: {
        pageIndex: system.pageIndex,
        systemIndex: system.systemIndex,
        cropSha256: system.source.cropSha256,
      },
      localMeasureCount,
      localMeasureNumbers,
      rawGlobalMeasureStart: globalMeasureStart,
      rawGlobalMeasureEnd: localMeasureCount === 0 ? globalMeasureStart : globalMeasureStart + localMeasureCount - 1,
    };
    globalMeasureStart += localMeasureCount;
    return evidence;
  });
  const normalizedMeasureCount = Math.max(
    0,
    ...draft.parts.flatMap((part) => part.staves.map((staff) => staff.measures.length)),
  );
  const rawMeasureBoundaries = systems.flatMap((system) =>
    Array.from({ length: system.localMeasureCount }, (_, localMeasureIndex) => ({
      globalMeasureIndex: system.rawGlobalMeasureStart + localMeasureIndex,
      source: system.source,
      localMeasureIndex,
    })),
  );
  const sourcesBySystem = new Map(
    bundle.systems.map((system) => [
      `${system.pageIndex}:${system.systemIndex}`,
      {
        pageIndex: system.pageIndex,
        systemIndex: system.systemIndex,
        cropSha256: system.source.cropSha256,
      },
    ]),
  );
  const normalizedSources = new Map<number, ReturnType<typeof sourceSchema.parse>>();
  for (const part of draft.parts) {
    for (const staff of part.staves) {
      for (const measure of staff.measures) {
        for (const voice of measure.voices) {
          for (const event of voice.events) {
            const source = event.source;
            if (source?.systemIndex === undefined) continue;
            const mapped = sourcesBySystem.get(`${source.pageIndex}:${source.systemIndex}`);
            if (mapped !== undefined) normalizedSources.set(measure.index, mapped);
          }
        }
      }
    }
  }
  const normalizedMeasureBoundaries = Array.from({ length: normalizedMeasureCount }, (_, globalMeasureIndex) => ({
    globalMeasureIndex,
    ...(normalizedSources.get(globalMeasureIndex) === undefined
      ? {}
      : { source: normalizedSources.get(globalMeasureIndex) }),
  }));
  return rokotJoiningEvidenceSchema.parse({
    schemaVersion: "1.0.0",
    normalizedMeasureCount,
    systems,
    rawMeasureBoundaries,
    normalizedMeasureBoundaries,
  });
}

function readMeasureNumbers(musicXmlUtf8: string): Record<string, string[]> {
  const root = parseMusicXmlDocument(new TextEncoder().encode(musicXmlUtf8)).documentElement;
  if (root === null || root.nodeName !== "score-partwise") return {};
  return Object.fromEntries(
    childElements(root, "part").map((part, partIndex) => [
      part.getAttribute("id") ?? `part-${partIndex}`,
      childElements(part, "measure").map(
        (measure, measureIndex) => measure.getAttribute("number") ?? `${measureIndex + 1}`,
      ),
    ]),
  );
}
