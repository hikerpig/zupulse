import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { cpus } from "node:os";
import { basename } from "node:path";
import { performance } from "node:perf_hooks";
import {
  analyzeHarmony,
  buildPaperSemiCrfEvents,
  bundledPaperSemiCrfModel,
  createDefaultHarmonyScope,
  createMusicXmlAdapter,
  projectAlphaTabHarmonyInput,
  type HarmonySegment,
} from "@zupulse/web-core";

export type HarmonyAnalysisBenchmarkReport = Awaited<ReturnType<typeof benchmarkHarmonyAnalysisFile>>;

export async function benchmarkHarmonyAnalysisFile(options: {
  scorePath: string;
  runs?: number;
  warmupRuns?: number;
  expectedResultSha256?: string;
}) {
  const runs = requireNonnegativeInteger(options.runs ?? 5, "runs", 1);
  const warmupRuns = requireNonnegativeInteger(options.warmupRuns ?? 1, "warmupRuns");
  if (options.expectedResultSha256 !== undefined && !/^[a-f0-9]{64}$/.test(options.expectedResultSha256)) {
    throw new Error("expected harmony benchmark checksum must be lowercase SHA-256");
  }

  const readStartedAt = performance.now();
  const bytes = new Uint8Array(await readFile(options.scorePath));
  const readMs = performance.now() - readStartedAt;
  const parseStartedAt = performance.now();
  const parsed = await createMusicXmlAdapter().parse({ fileName: basename(options.scorePath), bytes });
  const model = projectAlphaTabHarmonyInput(parsed.runtime as Parameters<typeof projectAlphaTabHarmonyInput>[0]);
  const parseAndProjectionMs = performance.now() - parseStartedAt;
  const scope = createDefaultHarmonyScope(model);
  const events = buildPaperSemiCrfEvents(model, scope);
  const analyze = (): HarmonySegment[] =>
    analyzeHarmony(model, {
      ...scope,
      topK: 8,
      decisionThreshold: 0.6,
    });

  for (let index = 0; index < warmupRuns; index += 1) analyze();
  collectGarbage();

  const rssBytesBefore = process.memoryUsage().rss;
  const analysisMs: number[] = [];
  const checksums = new Set<string>();
  let result: HarmonySegment[] = [];
  for (let index = 0; index < runs; index += 1) {
    const startedAt = performance.now();
    result = analyze();
    analysisMs.push(performance.now() - startedAt);
    checksums.add(sha256(canonicalHarmonyResultJson(result)));
    if (index < runs - 1) collectGarbage();
  }
  if (checksums.size !== 1) throw new Error("harmony benchmark produced inconsistent results");
  const resultSha256 = [...checksums][0]!;
  if (options.expectedResultSha256 !== undefined && resultSha256 !== options.expectedResultSha256) {
    throw new Error(
      `harmony benchmark result checksum mismatch: expected ${options.expectedResultSha256}, received ${resultSha256}`,
    );
  }

  const sortedDurations = [...analysisMs].sort((left, right) => left - right);
  const medianAnalysisMs =
    sortedDurations.length % 2 === 1
      ? sortedDurations[Math.floor(sortedDurations.length / 2)]!
      : (sortedDurations[sortedDurations.length / 2 - 1]! + sortedDurations[sortedDurations.length / 2]!) / 2;
  const labelCount = bundledPaperSemiCrfModel.labels.length;
  const maxSegmentLength = bundledPaperSemiCrfModel.maxSegmentLength;

  return {
    schemaVersion: "harmony-analysis-benchmark-v1" as const,
    command: "benchmark" as const,
    commit: currentCommit(),
    source: {
      name: basename(options.scorePath),
      sha256: sha256(bytes),
    },
    workload: {
      runs,
      warmupRuns,
      pitchedNotes: countPitchedNotes(model, scope.includedTrackIds),
      basicEvents: events.length,
      labelCount,
      maxSegmentLength,
      segmentLabelPotentials: countSegmentLabelPotentials(events.length, labelCount, maxSegmentLength),
    },
    performance: {
      readMs,
      parseAndProjectionMs,
      analysisMs,
      medianAnalysisMs,
      rssBytesBefore,
      rssBytesAfter: process.memoryUsage().rss,
      maxRssBytes: process.resourceUsage().maxRSS * 1024,
    },
    result: {
      segments: result.length,
      sha256: resultSha256,
    },
    environment: {
      platform: process.platform,
      architecture: process.arch,
      nodeVersion: process.version,
      cpu: cpus()[0]?.model ?? "unknown",
    },
  };
}

export function canonicalHarmonyResultJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

function countPitchedNotes(
  model: Parameters<typeof createDefaultHarmonyScope>[0],
  includedTrackIds: readonly string[],
): number {
  const included = new Set(includedTrackIds);
  return model.tracks
    .filter((track) => included.has(track.id) && !track.isPercussion)
    .reduce(
      (total, track) =>
        total +
        track.staves.reduce(
          (staffTotal, staff) =>
            staffTotal + staff.notes.filter((note) => note.soundingPitchClass !== undefined).length,
          0,
        ),
      0,
    );
}

function countSegmentLabelPotentials(eventCount: number, labelCount: number, maxSegmentLength: number): number {
  let ranges = 0;
  for (let endEvent = 1; endEvent <= eventCount; endEvent += 1) {
    ranges += Math.min(endEvent, maxSegmentLength);
  }
  return ranges * labelCount;
}

function requireNonnegativeInteger(value: number, name: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${name} must be an integer greater than or equal to ${minimum}`);
  }
  return value;
}

function sha256(input: string | Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}

function currentCommit(): string {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function collectGarbage(): void {
  const gc = (globalThis as typeof globalThis & { gc?: () => void }).gc;
  gc?.();
}
