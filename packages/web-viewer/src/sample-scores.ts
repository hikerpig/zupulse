import type { ScoreImportSource } from "@zupulse/web-core";

export type BundledSampleScore = {
  id: "first-light-practice";
  title: "First Light Practice";
  fileName: "first-light-practice.mxl";
  format: "musicxml";
  attribution: "Zupulse";
  license: "CC0-1.0";
  sha256: "ec1a465e7a0796637122f8c74b0fe16c798c4cb8d82121eb850152d1d3c177ec";
};

export const bundledSampleScores: readonly BundledSampleScore[] = [
  {
    id: "first-light-practice",
    title: "First Light Practice",
    fileName: "first-light-practice.mxl",
    format: "musicxml",
    attribution: "Zupulse",
    license: "CC0-1.0",
    sha256: "ec1a465e7a0796637122f8c74b0fe16c798c4cb8d82121eb850152d1d3c177ec",
  },
];

export function createSampleImportSource(
  sample: BundledSampleScore,
  readBytes: () => Promise<Uint8Array>,
): ScoreImportSource {
  return { fileName: sample.fileName, readBytes };
}
