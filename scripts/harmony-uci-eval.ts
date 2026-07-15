import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { unzipSync } from "fflate";
import {
  analyzeHarmonyRules,
  chordSymbolSchema,
  createHarmonyAnalysisInput,
  type ChordSymbolInput,
} from "../packages/web-core/src/index";

type Manifest = { source: string; sha256: string; license: string; citation: string; events: number };

const manifest = JSON.parse(
  await readFile(new URL("../test-fixtures/harmony/uci-bach-manifest.json", import.meta.url), "utf8"),
) as Manifest;
const archivePath = process.argv[2] ?? process.env.HARMONY_UCI_ZIP;
const archive = archivePath
  ? await readFile(archivePath)
  : new Uint8Array(await (await fetch(manifest.source)).arrayBuffer());
const digest = createHash("sha256").update(archive).digest("hex");
if (digest !== manifest.sha256) throw new Error(`UCI archive checksum mismatch: ${digest}`);
const data = unzipSync(archive)["jsbach_chorals_harmony.data"];
if (!data) throw new Error("UCI data file missing");

const pitchClassByStep = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 } as const;
type PitchStep = keyof typeof pitchClassByStep;
const cases = new TextDecoder()
  .decode(data)
  .trim()
  .split(/\r?\n/)
  .flatMap((line) => {
    const columns = line.split(",").map((value) => value.trim());
    const label = columns[16];
    const match = /^([A-G](?:#|b)?)(?:_)?([Mmd])([467])?$/.exec(label ?? "");
    if (!match) return [];
    const pitchClasses = columns.slice(2, 14).flatMap((value, index) => (value === "YES" ? [index] : []));
    if (pitchClasses.length === 0) return [];
    const root = pitchNameToPitch(match[1]!);
    const bass = pitchNameToPitch(columns[14]!);
    const expected: ChordSymbolInput = {
      root: { step: root.step, alter: root.alter },
      kind: match[2] === "M" ? "major" : match[2] === "m" ? "minor" : "diminished",
      degrees: [],
      ...(match[3] === "7" ? { extension: 7 } : {}),
      ...(bass.pitchClass !== root.pitchClass ? { bass: { step: bass.step, alter: bass.alter } } : {}),
    };
    return [
      {
        expected: chordSymbolSchema.parse(expected),
        input: createHarmonyAnalysisInput({
          ticksPerQuarter: 480,
          measures: [{ index: 0, durationTicks: 480, timeSignature: { numerator: 4, denominator: 4 } }],
          tracks: [
            {
              id: "bach",
              name: "Bach Choral Harmony",
              isPercussion: false,
              staves: [
                {
                  index: 0,
                  notes: pitchClasses.map((pitchClass, index) => ({
                    id: `${columns[0]}:${columns[1]}:${index}`,
                    moment: { measureIndex: 0, offsetTicks: 0 },
                    durationTicks: 480,
                    soundingPitchClass: pitchClass,
                    voice: index + 1,
                  })),
                },
              ],
            },
          ],
        }),
      },
    ];
  });

const results = cases.map(({ expected, input }) => {
  const segment = analyzeHarmonyRules(input, { includedTrackIds: ["bach"], topK: 8, decisionThreshold: 0 })[0];
  const alternatives = segment?.alternatives ?? [];
  return {
    expected,
    resolved: segment?.status === "resolved",
    correct: segment?.status === "resolved" && JSON.stringify(segment.chord) === JSON.stringify(expected),
    top8: alternatives.some((candidate) => JSON.stringify(candidate.chord) === JSON.stringify(expected)),
    confidence: segment?.status === "resolved" ? segment.confidence : 0,
  };
});
const resolved = results.filter((result) => result.resolved);
const report = {
  corpus: { name: "bach-choral-harmony", source: manifest.source, license: manifest.license, cases: results.length },
  metrics: {
    top8OracleRecall: ratio(results.filter((result) => result.top8).length, results.length),
    resolvedPrecision: ratio(results.filter((result) => result.correct).length, resolved.length),
    resolvedCoverage: ratio(resolved.length, results.length),
    confidence: calibrationError(results),
  },
  citation: manifest.citation,
};
console.log(JSON.stringify(report, null, 2));

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function calibrationError(results: readonly { confidence: number; correct: boolean }[]): number {
  return (
    results.reduce((sum, result) => sum + Math.abs(result.confidence - Number(result.correct)), 0) /
    (results.length || 1)
  );
}

function pitchNameToPitch(name: string): { step: PitchStep; alter: number; pitchClass: number } {
  const step = name.slice(0, 1) as PitchStep;
  const alter = name.endsWith("#") ? 1 : name.endsWith("b") ? -1 : 0;
  return { step, alter, pitchClass: (pitchClassByStep[step] + alter + 12) % 12 };
}
