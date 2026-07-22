import { performance } from "node:perf_hooks";
import {
  analyzeHarmonyRules,
  createHarmonyAnalysisInput,
  reducePreviewTransport,
} from "../packages/web-core/src/index";

const noteCount = 5_000;
const measureCount = 40;
const ticksPerMeasure = 1_920;
const sampleCount = Number(process.env.HARMONY_BENCHMARK_SAMPLES ?? 20);
const samples: number[] = [];
const heapBefore = process.memoryUsage().heapUsed;
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

for (let index = 0; index < sampleCount; index += 1) {
  const start = performance.now();
  analyzeHarmonyRules(input, { includedTrackIds: ["benchmark-piano"], topK: 8, decisionThreshold: 0.6 });
  samples.push(performance.now() - start);
}
samples.sort((left, right) => left - right);
const p95 = samples[Math.ceil(samples.length * 0.95) - 1]!;
const previewSamples: number[] = [];
const cancelSamples: number[] = [];
for (let index = 0; index < 100; index += 1) {
  const start = performance.now();
  reducePreviewTransport({ status: "paused", positionTicks: 0, speed: 1 }, { type: "play" });
  reducePreviewTransport({ status: "playing", positionTicks: 0, speed: 1 }, { type: "pause" });
  previewSamples.push(performance.now() - start);
  const controller = new AbortController();
  const cancelStart = performance.now();
  controller.signal.addEventListener("abort", () => undefined, { once: true });
  controller.abort();
  cancelSamples.push(performance.now() - cancelStart);
}
previewSamples.sort((left, right) => left - right);
cancelSamples.sort((left, right) => left - right);
const previewP95 = previewSamples[Math.ceil(previewSamples.length * 0.95) - 1]!;
const cancelP95 = cancelSamples[Math.ceil(cancelSamples.length * 0.95) - 1]!;
const heapDeltaMb = (process.memoryUsage().heapUsed - heapBefore) / 1024 / 1024;
console.log(
  JSON.stringify(
    {
      noteCount,
      samples: samples.length,
      analysisP95Ms: Number(p95.toFixed(2)),
      previewReducerP95Ms: Number(previewP95.toFixed(4)),
      cancelFeedbackP95Ms: Number(cancelP95.toFixed(4)),
      resourceBudget: { heapDeltaMb: Number(heapDeltaMb.toFixed(2)), maxHeapDeltaMb: 256 },
      budgets: { analysisP95Ms: 5_000, uiAndCancelP95Ms: 100 },
    },
    null,
    2,
  ),
);
