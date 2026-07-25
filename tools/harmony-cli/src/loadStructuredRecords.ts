import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import {
  harmonyStructuredRecordPieceSchema,
  harmonyStructuredRecordsReportSchema,
  type HarmonyStructuredRecordPiece,
  type HarmonyStructuredRecordsReport,
} from "./schemas";

export async function readHarmonyStructuredRecordsManifest(
  manifestPath: string,
  expectedSplit?: "train" | "tune",
): Promise<HarmonyStructuredRecordsReport> {
  const report = harmonyStructuredRecordsReportSchema.parse(JSON.parse(await readFile(manifestPath, "utf8")));
  if (expectedSplit !== undefined && report.split !== expectedSplit)
    throw new Error(`structured records split mismatch: expected ${expectedSplit}, got ${report.split}`);
  return report;
}

export async function* iterateHarmonyStructuredRecordPieces(
  manifestPath: string,
  expectedSplit?: "train" | "tune",
): AsyncGenerator<HarmonyStructuredRecordPiece> {
  const report = await readHarmonyStructuredRecordsManifest(manifestPath, expectedSplit);
  const root = dirname(resolve(manifestPath));
  for (const summary of report.pieces) {
    const path = resolveInside(root, summary.path);
    const bytes = await readFile(path);
    if (bytes.byteLength !== summary.bytes) throw new Error(`structured record byte length mismatch: ${summary.id}`);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (sha256 !== summary.sha256) throw new Error(`structured record checksum mismatch: ${summary.id}`);
    const piece = harmonyStructuredRecordPieceSchema.parse(JSON.parse(bytes.toString("utf8")));
    if (piece.id !== summary.id || piece.corpus !== summary.corpus || piece.groupId !== summary.groupId)
      throw new Error(`structured record identity mismatch: ${summary.id}`);
    const counts = summarize(piece);
    if (
      counts.windows !== summary.windows ||
      counts.ranges !== summary.ranges ||
      counts.candidates !== summary.candidates ||
      counts.goldSegments !== summary.goldSegments ||
      counts.excludedSegments !== summary.excludedSegments
    )
      throw new Error(`structured record count mismatch: ${summary.id}`);
    yield piece;
  }
}

function summarize(piece: HarmonyStructuredRecordPiece) {
  return {
    windows: piece.windows.length,
    ranges: piece.windows.reduce((sum, window) => sum + window.ranges.length, 0),
    candidates: piece.windows.reduce(
      (sum, window) => sum + window.ranges.reduce((rangeSum, range) => rangeSum + range.candidates.length, 0),
      0,
    ),
    goldSegments: piece.windows.reduce((sum, window) => sum + window.gold.length, 0),
    excludedSegments:
      piece.excluded.unsupported +
      piece.excluded.missingBoundary +
      piece.excluded.excessiveDuration +
      piece.excluded.candidateMiss,
  };
}

function resolveInside(root: string, path: string): string {
  const target = resolve(root, path);
  if (target !== root && !target.startsWith(`${root}${sep}`))
    throw new Error(`structured record path escapes manifest directory: ${path}`);
  return target;
}
