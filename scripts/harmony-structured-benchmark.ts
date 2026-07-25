import { analyzeHarmonyRules } from "../packages/web-core/src/index";
import { performance } from "node:perf_hooks";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { parseDcmlPiece } from "../tools/harmony-cli/src/adapters/dcml";
import { dcmlGroupId } from "../tools/harmony-cli/src/adapters/dcmlEvaluation";
import { assignV3DatasetRole } from "../tools/harmony-cli/src/evaluationProtocol";
import { harmonyDatasetManifestSchema, harmonyEvaluationProtocolV3Schema } from "../tools/harmony-cli/src/schemas";

const mode = process.argv[2];
const dataRoot = process.argv[3];
if ((mode !== "beam" && mode !== "exact") || !dataRoot)
  throw new Error("usage: harmony-structured-benchmark <beam|exact> <data-root>");

const manifest = harmonyDatasetManifestSchema.parse(
  JSON.parse(await readFile("test-fixtures/harmony/datasets/manifest.json", "utf8")),
);
const protocol = harmonyEvaluationProtocolV3Schema.parse(
  JSON.parse(await readFile("test-fixtures/harmony/datasets/protocol-v3.json", "utf8")),
);
const item = manifest.cases.find((candidate) => candidate.id === "dcml-mozart-v2.3");
const policy = protocol.corpora.find((candidate) => candidate.caseId === item?.id);
if (!item || item.kind !== "accuracy-corpus" || item.adapter !== "dcml" || !policy)
  throw new Error("Mozart v2.3 benchmark contract is missing");
const corpusRoot = resolve(dataRoot, item.datasetPath);
const pieceIds = (await readdir(resolve(corpusRoot, "harmonies")))
  .filter((name) => name.endsWith(".harmonies.tsv"))
  .map((name) => name.slice(0, -".harmonies.tsv".length))
  .filter((pieceId) => {
    const groupId = dcmlGroupId(pieceId, item.groupBy ?? "prefix-before-hyphen", item.id);
    return assignV3DatasetRole(groupId, policy) === "tune";
  })
  .sort();

const samples: Array<{ pieceId: string; durationMs: number; ranges: number }> = [];
for (const pieceId of pieceIds) {
  const piece = parseDcmlPiece({
    corpus: item.id,
    groupId: dcmlGroupId(pieceId, item.groupBy ?? "prefix-before-hyphen", item.id),
    measures: await readFile(resolve(corpusRoot, `measures/${pieceId}.measures.tsv`), "utf8"),
    notes: await readFile(resolve(corpusRoot, `notes/${pieceId}.notes.tsv`), "utf8"),
    harmonies: await readFile(resolve(corpusRoot, `harmonies/${pieceId}.harmonies.tsv`), "utf8"),
  });
  let ranges = 0;
  const start = performance.now();
  analyzeHarmonyRules(piece.input, {
    includedTrackIds: ["dcml"],
    topK: 8,
    decisionThreshold: 0,
    primaryRerankerModel: false,
    ...(mode === "exact"
      ? {
          sequenceSearchMode: "exact" as const,
          maxSegmentQuarterNotes: 8,
          diagnostics: { onRangeBuilt: () => (ranges += 1) },
        }
      : {
          sequenceSearchMode: "beam" as const,
          maxSegmentQuarterNotes: 8,
          diagnostics: { onRangeBuilt: () => (ranges += 1) },
        }),
  });
  samples.push({ pieceId, durationMs: performance.now() - start, ranges });
}
const durations = samples.map((sample) => sample.durationMs).sort((a, b) => a - b);
const maxRss = process.resourceUsage().maxRSS;
const maxRssMb = maxRss / 1024;
console.log(
  JSON.stringify(
    {
      contract: "mozart-tune-qn8-top8",
      mode,
      pieces: samples.length,
      p95Ms: Number(durations[Math.ceil(durations.length * 0.95) - 1]!.toFixed(2)),
      maxRssMb: Number(maxRssMb.toFixed(2)),
      totalRanges: samples.reduce((sum, sample) => sum + sample.ranges, 0),
      samples: samples.map((sample) => ({ ...sample, durationMs: Number(sample.durationMs.toFixed(2)) })),
    },
    null,
    2,
  ),
);
