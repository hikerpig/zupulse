import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { evaluateDcmlCorpus, dcmlGroupId } from "./adapters/dcmlEvaluation";
import { evaluatePop909Corpus } from "./adapters/pop909Evaluation";
import { assertV3CorpusGroups } from "./evaluationProtocol";
import {
  harmonyDatasetEvalReportSchema,
  harmonyDatasetManifestSchema,
  harmonyEvaluationProtocolV3Schema,
  type HarmonyDatasetEvalReport,
} from "./schemas";

export async function evaluateHarmonyV3FinalHoldout(
  manifestPath: string,
  protocolPath: string,
  dataRoot: string,
): Promise<{ candidate: HarmonyDatasetEvalReport; ruleBaseline: HarmonyDatasetEvalReport }> {
  const manifest = harmonyDatasetManifestSchema.parse(JSON.parse(await readFile(manifestPath, "utf8")));
  const protocol = harmonyEvaluationProtocolV3Schema.parse(JSON.parse(await readFile(protocolPath, "utf8")));
  const candidateCases: HarmonyDatasetEvalReport["cases"] = [];
  const ruleBaselineCases: HarmonyDatasetEvalReport["cases"] = [];
  for (const policy of protocol.corpora.filter((corpus) => corpus.finalHoldoutGroups.length > 0)) {
    const item = manifest.cases.find((candidate) => candidate.id === policy.caseId);
    if (!item || item.kind !== "accuracy-corpus") throw new Error(`accuracy dataset case not found: ${policy.caseId}`);
    if (item.source.revision !== policy.sourceRevision) throw new Error(`${item.id} protocol revision mismatch`);
    const archive = await readFile(resolveInside(dataRoot, item.archivePath));
    const archiveSha256 = createHash("sha256").update(archive).digest("hex");
    if (archiveSha256 !== item.source.sha256) throw new Error(`${item.id} archive checksum mismatch: ${archiveSha256}`);
    const datasetPath = resolveInside(dataRoot, item.datasetPath);
    if (item.adapter === "dcml") {
      const pieceIds = (await readdir(resolve(datasetPath, "harmonies")))
        .filter((name) => name.endsWith(".harmonies.tsv"))
        .map((name) => name.slice(0, -".harmonies.tsv".length));
      const groupMode = item.groupBy ?? "prefix-before-hyphen";
      assertV3CorpusGroups(
        policy,
        pieceIds.map((pieceId) => dcmlGroupId(pieceId, groupMode, item.id)),
      );
      const sharedOptions = {
        id: item.id,
        sourceRevision: item.source.revision,
        forcedEvalGroups: policy.finalHoldoutGroups,
        includeGroups: policy.finalHoldoutGroups,
        ...(item.include === undefined ? {} : { include: item.include }),
        ...(item.groupBy === undefined ? {} : { groupBy: item.groupBy }),
        reportSplit: "eval",
      } as const;
      candidateCases.push(await evaluateDcmlCorpus(datasetPath, sharedOptions));
      ruleBaselineCases.push(
        await evaluateDcmlCorpus(datasetPath, {
          ...sharedOptions,
          decisionThreshold: 0.6,
          primaryRerankerModel: false,
        }),
      );
    } else {
      const groups = (await readdir(datasetPath, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory() && /^\d{3}$/.test(entry.name))
        .map((entry) => entry.name);
      assertV3CorpusGroups(policy, groups);
      const sharedOptions = {
        id: item.id,
        sourceRevision: item.source.revision,
        forcedEvalGroups: policy.finalHoldoutGroups,
        includeGroups: policy.finalHoldoutGroups,
        ...(item.include === undefined ? {} : { include: item.include }),
        reportSplit: "eval",
      } as const;
      candidateCases.push(await evaluatePop909Corpus(datasetPath, sharedOptions));
      ruleBaselineCases.push(
        await evaluatePop909Corpus(datasetPath, {
          ...sharedOptions,
          decisionThreshold: 0.6,
          primaryRerankerModel: false,
        }),
      );
    }
  }
  return {
    candidate: buildReport(`${manifest.id}:${protocol.id}:final-holdout:candidate`, candidateCases),
    ruleBaseline: buildReport(`${manifest.id}:${protocol.id}:final-holdout:rule-baseline`, ruleBaselineCases),
  };

  function buildReport(manifestId: string, cases: HarmonyDatasetEvalReport["cases"]): HarmonyDatasetEvalReport {
    return harmonyDatasetEvalReportSchema.parse({
      schemaVersion: "2.6.0",
      command: "eval",
      manifest: manifestId,
      summary: {
        passed: cases.filter((item) => item.status === "passed").length,
        failed: cases.filter((item) => item.status === "failed").length,
      },
      cases,
    });
  }
}

export async function evaluateHarmonyV3FinalHoldoutFile(
  manifestPath: string,
  protocolPath: string,
  dataRoot: string,
  outputPath: string,
) {
  const report = await evaluateHarmonyV3FinalHoldout(manifestPath, protocolPath, dataRoot);
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  return {
    command: "eval-v3-final" as const,
    output: outputPath,
    candidate: report.candidate.summary,
    ruleBaseline: report.ruleBaseline.summary,
  };
}

function resolveInside(root: string, path: string): string {
  const absoluteRoot = resolve(root);
  const target = resolve(absoluteRoot, path);
  if (target !== absoluteRoot && !target.startsWith(`${absoluteRoot}${sep}`))
    throw new Error(`dataset path escapes root: ${path}`);
  return target;
}
