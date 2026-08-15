import { z } from "zod";
import { sha256Bytes } from "../canonical-json";
import { PdfOmrError } from "../errors";
import { sha256Schema } from "../schemas";

const parameterSchema = z.union([z.string(), z.number().finite(), z.boolean()]);

export const frozenProtocolSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    status: z.literal("frozen"),
    frozenAt: z.iso.datetime(),
    manifestSha256: sha256Schema,
    benchmarkCommit: z.string().min(7),
    engines: z
      .array(
        z
          .object({
            id: z.string().min(1),
            version: z.string().min(1),
            modelSha256: sha256Schema.optional(),
            parameters: z.record(z.string(), parameterSchema),
          })
          .strict(),
      )
      .min(1),
    preprocessVariants: z.array(z.string().min(1)).min(1),
    render: z
      .object({ id: z.string().min(1), version: z.string().min(1), dpi: z.number().int().positive().optional() })
      .strict()
      .optional(),
    segmentation: z
      .object({ id: z.string().min(1), version: z.string().min(1), scope: z.enum(["full-page", "system-crop"]) })
      .strict()
      .optional(),
    builder: z
      .object({ id: z.string().min(1), version: z.string().min(1), sourceSha256: sha256Schema })
      .strict()
      .optional(),
    decoder: z
      .object({ id: z.string().min(1), version: z.string().min(1), parameters: z.record(z.string(), parameterSchema) })
      .strict()
      .optional(),
    gates: z
      .object({
        jointF1: z.number().min(0).max(1),
        validMeasureRate: z.number().min(0).max(1),
        parseRate: z.number().min(0).max(1),
        structuralAgreementRate: z.number().min(0).max(1),
        harmonyPrecisionDelta: z.number().min(-1).max(1),
        falseConfidentChordRate: z.number().min(0).max(1),
        reproducibilityAgreementRate: z.number().min(0).max(1),
        cancelLatencyP95Ms: z.number().positive(),
        maxWallTimeP95Ms: z.number().positive().optional(),
        maxPeakRssP95Bytes: z.number().int().positive().optional(),
        maxGpuMemoryP95Bytes: z.number().int().positive().optional(),
      })
      .strict(),
  })
  .strict();

export type FrozenProtocol = z.infer<typeof frozenProtocolSchema>;

export function verifyFrozenProtocol(
  bytes: Uint8Array,
  request: {
    protocolSha256: string;
    manifestSha256: string;
    engineId: string;
    preprocess: string;
  },
): FrozenProtocol {
  if (sha256Bytes(bytes) !== request.protocolSha256) throw protocolError("protocol-hash-mismatch");
  let input: unknown;
  try {
    input = JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    throw new PdfOmrError("INVALID_INPUT", "frozen benchmark protocol JSON is invalid", {
      context: { reason: "invalid-protocol-json" },
      cause: error,
    });
  }
  let protocol: FrozenProtocol;
  try {
    protocol = frozenProtocolSchema.parse(input);
  } catch (error) {
    throw new PdfOmrError("INVALID_INPUT", "frozen benchmark protocol is invalid", {
      context: { reason: "invalid-protocol" },
      cause: error,
    });
  }
  if (protocol.manifestSha256 !== request.manifestSha256) throw protocolError("manifest-hash-mismatch");
  if (!protocol.engines.some((engine) => engine.id === request.engineId)) throw protocolError("engine-not-frozen");
  if (!protocol.preprocessVariants.includes(request.preprocess)) throw protocolError("preprocess-not-frozen");
  return protocol;
}

function protocolError(reason: string): PdfOmrError {
  return new PdfOmrError("INVALID_INPUT", "holdout request does not match the frozen protocol", {
    context: { reason },
  });
}
