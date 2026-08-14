import { z } from "zod";
import { sha256Bytes } from "../canonical-json";
import { verifyCorpusManifest } from "./corpus";
import { frozenProtocolSchema, type FrozenProtocol } from "./verify-protocol";

const transcodaEnvironmentSchema = z.object({
  engine: z.object({ id: z.literal("transcoda"), revision: z.string().min(1) }),
  model: z.object({ sha256: z.string().length(64) }),
  decoder: z.object({
    grammarConstrained: z.boolean(),
    layoutNormalization: z.boolean(),
    maxLength: z.number().int().positive(),
    repetitionPenalty: z.number().positive(),
  }),
});

const legatoEnvironmentSchema = z.object({
  engine: z.object({ id: z.literal("legato"), revision: z.string().min(1) }),
  model: z.object({ sha256: z.string().length(64) }),
  visionEncoder: z.object({ revision: z.string().min(1) }),
  runtime: z.object({ inferenceDtype: z.object({ mps: z.string().min(1) }) }),
  preprocess: z.object({
    maxPdfPages: z.number().int().positive(),
    normalizedWidth: z.number().int().positive(),
    minimumHeight: z.number().int().positive(),
  }),
  decoder: z.object({
    maxLength: z.number().int().positive(),
    numBeams: z.number().int().positive(),
    repetitionPenalty: z.number().positive(),
  }),
});

const rokotEnvironmentSchema = z.object({
  engine: z.object({ id: z.literal("rokot"), revision: z.string().min(1) }),
  model: z.object({ sha256: z.string().length(64) }),
  visionProjector: z.object({ sha256: z.string().length(64) }),
  runtime: z.object({ llamaCppBuild: z.string().min(1), abcConverter: z.string().min(1) }),
  decoder: z.object({
    temperature: z.number().finite(),
    maxNewTokens: z.number().int().positive(),
    reasoning: z.string().min(1),
    concurrency: z.number().int().positive(),
  }),
});

export type PublicPianoformProtocolInput = {
  manifestBytes: Uint8Array;
  benchmarkCommit: string;
  frozenAt: string;
  audiverisVersion: string;
  builderSourceBytes: Uint8Array;
  transcodaEnvironment: unknown;
  legatoEnvironment: unknown;
  rokotEnvironment: unknown;
};

export function createPublicPianoformProtocol(input: PublicPianoformProtocolInput): FrozenProtocol {
  const manifestInput: unknown = JSON.parse(new TextDecoder().decode(input.manifestBytes));
  if (!isStandardHoldoutInput(manifestInput)) {
    throw new Error("public pianoform protocol requires a standard holdout manifest");
  }
  const manifest = verifyCorpusManifest(manifestInput);
  if (manifest.items.some((item) => item.split !== "holdout")) {
    throw new Error("public pianoform protocol requires a standard holdout manifest");
  }

  const transcoda = transcodaEnvironmentSchema.parse(input.transcodaEnvironment);
  const legato = legatoEnvironmentSchema.parse(input.legatoEnvironment);
  const rokot = rokotEnvironmentSchema.parse(input.rokotEnvironment);
  return frozenProtocolSchema.parse({
    schemaVersion: "1.0.0",
    status: "frozen",
    frozenAt: input.frozenAt,
    manifestSha256: sha256Bytes(input.manifestBytes),
    benchmarkCommit: input.benchmarkCommit,
    engines: [
      { id: "audiveris", version: input.audiverisVersion, parameters: {} },
      {
        id: "transcoda",
        version: transcoda.engine.revision,
        modelSha256: transcoda.model.sha256,
        parameters: { rasterDpi: 150, ...transcoda.decoder },
      },
      {
        id: "legato",
        version: legato.engine.revision,
        modelSha256: legato.model.sha256,
        parameters: {
          visionEncoderRevision: legato.visionEncoder.revision,
          inferenceDtypeMps: legato.runtime.inferenceDtype.mps,
          ...legato.preprocess,
          ...legato.decoder,
        },
      },
      {
        id: "rokot",
        version: rokot.engine.revision,
        modelSha256: rokot.model.sha256,
        parameters: {
          visionProjectorSha256: rokot.visionProjector.sha256,
          llamaCppBuild: rokot.runtime.llamaCppBuild,
          abcConverter: rokot.runtime.abcConverter,
          ...rokot.decoder,
        },
      },
    ],
    preprocessVariants: ["none"],
    builder: {
      id: "build_public_pianoform_benchmark.py",
      version: "1.0.0",
      sourceSha256: sha256Bytes(input.builderSourceBytes),
    },
    gates: {
      jointF1: 0.9,
      validMeasureRate: 0.95,
      parseRate: 0.95,
      structuralAgreementRate: 0.9,
      harmonyPrecisionDelta: -0.05,
      falseConfidentChordRate: 0.03,
      reproducibilityAgreementRate: 1,
      cancelLatencyP95Ms: 2000,
      maxWallTimeP95Ms: 1_800_000,
      maxPeakRssP95Bytes: 8_589_934_592,
      maxGpuMemoryP95Bytes: 17_179_869_184,
    },
  });
}

function isStandardHoldoutInput(value: unknown): value is {
  execution: { profile: "standard" };
} {
  if (typeof value !== "object" || value === null || !("execution" in value)) return false;
  const execution = value.execution;
  return (
    typeof execution === "object" && execution !== null && "profile" in execution && execution.profile === "standard"
  );
}
