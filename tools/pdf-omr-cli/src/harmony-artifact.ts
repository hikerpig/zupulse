import { z } from "zod";
import { sha256Schema } from "./schemas";

export const harmonyArtifactSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    draftSha256: sha256Schema,
    omr: z
      .object({
        engine: z
          .object({
            id: z.string().min(1),
            version: z.string().min(1),
            modelSha256: sha256Schema.optional(),
          })
          .strict(),
      })
      .strict()
      .optional(),
    harmony: z
      .object({
        algorithmVersion: z.string().min(1),
        decisionThreshold: z.number().min(0).max(1),
        topK: z.number().int().min(1).max(8),
      })
      .strict(),
    readiness: z.enum(["ready", "ready-with-warnings"]),
    diagnostics: z.array(z.unknown()),
    segments: z.array(z.unknown()),
  })
  .strict();

export type HarmonyArtifact = z.infer<typeof harmonyArtifactSchema>;
