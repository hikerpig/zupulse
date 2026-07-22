import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { evaluateDcmlCorpus } from "./adapters/dcmlEvaluation";
import { evaluateAsapCorpus } from "./adapters/asapEvaluation";
import { evaluatePop909Corpus } from "./adapters/pop909Evaluation";
import type { DatasetSplit } from "./evaluationProtocol";
import { harmonyDatasetEvalReportSchema, harmonyDatasetManifestSchema, type HarmonyDatasetEvalReport } from "./schemas";

export async function evaluateHarmonyDatasetManifest(
  path: string,
  dataRoot: string,
  caseId?: string,
  reportSplit: DatasetSplit = "eval",
): Promise<HarmonyDatasetEvalReport> {
  const manifest = harmonyDatasetManifestSchema.parse(JSON.parse(await readFile(path, "utf8")));
  const selected = caseId === undefined ? manifest.cases : manifest.cases.filter((item) => item.id === caseId);
  if (selected.length === 0) throw new Error(`dataset case not found: ${caseId}`);
  const cases = [];
  for (const item of selected) {
    const archive = await readFile(resolveInside(dataRoot, item.archivePath));
    const sha256 = createHash("sha256").update(archive).digest("hex");
    if (sha256 !== item.source.sha256) throw new Error(`${item.id} archive checksum mismatch: ${sha256}`);
    const datasetPath = resolveInside(dataRoot, item.datasetPath);
    if (item.adapter === "dcml") {
      cases.push(
        await evaluateDcmlCorpus(datasetPath, {
          id: item.id,
          forcedEvalGroups: item.forcedEvalGroups,
          ...(item.include === undefined ? {} : { include: item.include }),
          ...(item.groupBy === undefined ? {} : { groupBy: item.groupBy }),
          reportSplit,
        }),
      );
      continue;
    }
    if (item.adapter === "pop909") {
      cases.push(
        await evaluatePop909Corpus(datasetPath, {
          id: item.id,
          forcedEvalGroups: item.forcedEvalGroups,
          ...(item.include === undefined ? {} : { include: item.include }),
          reportSplit,
        }),
      );
      continue;
    }
    if (item.adapter === "asap") {
      cases.push(
        await evaluateAsapCorpus(datasetPath, {
          id: item.id,
          ...(item.include === undefined ? {} : { include: item.include }),
        }),
      );
      continue;
    }
    throw new Error(`dataset adapter not implemented: ${item.adapter}`);
  }
  return harmonyDatasetEvalReportSchema.parse({
    schemaVersion: "2.3.0",
    command: "eval",
    manifest: manifest.id,
    summary: {
      passed: cases.filter((item) => item.status === "passed").length,
      failed: cases.filter((item) => item.status === "failed").length,
    },
    cases,
  });
}

function resolveInside(root: string, path: string): string {
  const absoluteRoot = resolve(root);
  const target = resolve(absoluteRoot, path);
  if (target !== absoluteRoot && !target.startsWith(`${absoluteRoot}${sep}`))
    throw new Error(`dataset path escapes root: ${path}`);
  return target;
}
