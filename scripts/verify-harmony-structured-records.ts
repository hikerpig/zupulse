import {
  iterateHarmonyStructuredRecordPieces,
  readHarmonyStructuredRecordsManifest,
} from "../tools/harmony-cli/src/loadStructuredRecords";

const manifestPath = process.argv[2];
if (!manifestPath) throw new Error("usage: verify-harmony-structured-records <manifest.json>");
const report = await readHarmonyStructuredRecordsManifest(manifestPath);
let pieces = 0;
let windows = 0;
let ranges = 0;
for await (const piece of iterateHarmonyStructuredRecordPieces(manifestPath, report.split)) {
  pieces += 1;
  windows += piece.windows.length;
  ranges += piece.windows.reduce((sum, window) => sum + window.ranges.length, 0);
}
if (pieces !== report.aggregate.pieces || windows !== report.aggregate.windows || ranges !== report.aggregate.ranges)
  throw new Error("structured record aggregate mismatch");
console.log(JSON.stringify({ manifestPath, split: report.split, pieces, windows, ranges }, null, 2));
