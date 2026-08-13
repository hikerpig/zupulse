import type { ScoreImportSource } from "@zupulse/web-core";

export type BundledSampleScore = {
  id: "cannon-in-d";
  title: "Cannon in D";
  fileName: "cannon-in-d.mxl";
  format: "musicxml";
  attribution: "MuseScore user 17746751";
  license: "Unspecified";
  sha256: "3029cedc603228153e8468633e70e0cdef8581d58dc95b9acdfaf212a66b2daa";
};

export type BundledSampleSource = {
  sample: BundledSampleScore;
  createSource(): ScoreImportSource;
};

export const bundledSampleScores: readonly BundledSampleScore[] = [
  {
    id: "cannon-in-d",
    title: "Cannon in D",
    fileName: "cannon-in-d.mxl",
    format: "musicxml",
    attribution: "MuseScore user 17746751",
    license: "Unspecified",
    sha256: "3029cedc603228153e8468633e70e0cdef8581d58dc95b9acdfaf212a66b2daa",
  },
];

export function createSampleImportSource(
  sample: BundledSampleScore,
  readBytes: () => Promise<Uint8Array>,
): ScoreImportSource {
  return { fileName: sample.fileName, readBytes, telemetrySource: "sample" };
}
