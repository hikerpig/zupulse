import { performance } from "node:perf_hooks";
import { analyzeHarmonyRules, createHarmonyAnalysisInput } from "../packages/web-core/src/index";

const noteCount = 5_000;
const measureCount = 40;
const ticksPerMeasure = 1_920;
const samples: number[] = [];
const input = createHarmonyAnalysisInput({
  ticksPerQuarter: 480,
  measures: Array.from({ length: measureCount }, (_, index) => ({
    index,
    durationTicks: ticksPerMeasure,
    timeSignature: { numerator: 4, denominator: 4 },
  })),
  tracks: [
    {
      id: "benchmark-piano",
      name: "Benchmark Piano",
      isPercussion: false,
      staves: [
        {
          index: 0,
          notes: Array.from({ length: noteCount }, (_, index) => ({
            id: `note-${index}`,
            moment: { measureIndex: index % measureCount, offsetTicks: (index * 120) % ticksPerMeasure },
            durationTicks: 120,
            soundingPitchClass: [0, 4, 7, 11][index % 4]!,
            voice: (index % 4) + 1,
          })),
        },
      ],
    },
  ],
});

for (let index = 0; index < 20; index += 1) {
  const start = performance.now();
  analyzeHarmonyRules(input, { includedTrackIds: ["benchmark-piano"], topK: 8, decisionThreshold: 0.6 });
  samples.push(performance.now() - start);
}
samples.sort((left, right) => left - right);
const p95 = samples[Math.ceil(samples.length * 0.95) - 1]!;
console.log(JSON.stringify({ noteCount, samples: samples.length, analysisP95Ms: Number(p95.toFixed(2)) }, null, 2));
