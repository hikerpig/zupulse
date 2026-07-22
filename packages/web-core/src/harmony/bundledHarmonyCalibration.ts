import type { HarmonyCalibrationModel } from "./confidenceCalibration";

export const bundledHarmonyCalibrationModel = {
  schemaVersion: "1.0.0",
  featureVersion: "primary-local-margin-v1",
  steps: [
    { upperBound: 0.47, probability: 0 },
    { upperBound: 0.54, probability: 0.11 },
    { upperBound: 0.57, probability: 0.23 },
    { upperBound: 0.63, probability: 0.35 },
    { upperBound: 0.82, probability: 0.51 },
    { upperBound: 0.91, probability: 0.58 },
    { upperBound: 1, probability: 0.62 },
  ],
  provenance: {
    algorithmVersion: "weighted-pava-v1",
    caseId: "dcml-mozart-v2.3",
    corpusRevision: "v2.3@5337257a5318711e6302cfe85c3f1a6ade3c6271",
    trainingGroupsSha256: "5e5e684b46c076c1065f3501fa3acacc1bb262ab85669a6c367773930177fab4",
    trainingReportSha256: "0c729e2cf74595f9e5722a312f95e14094c2be56584acb3683a0a30965261647",
    license: "CC-BY-NC-SA-4.0",
    sourceUrl: "https://github.com/DCMLab/mozart_piano_sonatas",
  },
} as const satisfies HarmonyCalibrationModel & { provenance: Record<string, string> };
