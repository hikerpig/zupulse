import { z } from "zod";
import { musicalPositionSchema, practicePlaybackSidecarSchema } from "../playback/schemas";
import { scoreIdentitySchema } from "../score/schemas";

const timestampSchema = z.iso.datetime();
const quantizationSchema = z
  .object({
    grid: z.enum(["1/8", "1/16", "1/32"]),
    swing: z.boolean(),
  })
  .strict();

export const sidecarPayloadSchema = z
  .object({
    schemaVersion: z.literal("0.2.0"),
    identity: scoreIdentitySchema,
    practice: z
      .object({
        tempoOverride: z.number().optional(),
        transpose: z.number().optional(),
        loops: z.array(
          z
            .object({
              id: z.string(),
              startTick: z.number(),
              endTick: z.number(),
            })
            .strict(),
        ),
        sections: z.array(
          z
            .object({
              id: z.string(),
              name: z.string(),
              startTick: z.number(),
              endTick: z.number(),
            })
            .strict(),
        ),
        annotations: z.array(
          z
            .object({
              id: z.string(),
              tick: z.number(),
              text: z.string(),
              updatedAt: timestampSchema,
            })
            .strict(),
        ),
        playback: practicePlaybackSidecarSchema,
      })
      .strict(),
    tracks: z.record(
      z.string(),
      z
        .object({
          muted: z.boolean().optional(),
          solo: z.boolean().optional(),
          volume: z.number().min(0).max(1).optional(),
          instrument: z.string().optional(),
        })
        .strict(),
    ),
    midi: z
      .object({
        quantization: quantizationSchema,
        handAssignments: z.record(z.string(), z.enum(["left", "right", "unknown"])),
        measureCorrections: z.record(
          z.string(),
          z
            .object({
              measureId: z.string(),
              quantization: quantizationSchema.optional(),
              handAssignments: z.record(z.string(), z.enum(["left", "right", "unknown"])).optional(),
            })
            .strict(),
        ),
      })
      .strict()
      .optional(),
  })
  .strict();

export const localPlaybackResumeSchema = z
  .object({
    position: musicalPositionSchema,
    updatedAt: timestampSchema,
  })
  .strict();
