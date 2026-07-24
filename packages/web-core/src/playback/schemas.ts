import { z } from "zod";

const timestampSchema = z.iso.datetime();

export const musicalPositionSchema = z
  .object({
    measureId: z.string(),
    measureIndex: z.number().int(),
    beatIndex: z.number().int(),
    tick: z.number().int().nonnegative(),
    cachedTimeMs: z.number().nonnegative(),
  })
  .strict();

const loopRegionBaseSchema = z
  .object({
    id: z.string(),
    start: musicalPositionSchema,
    end: musicalPositionSchema,
    snapMode: z.enum(["off", "beat", "measure"]),
    speedOverride: z.number().min(0.25).max(2).optional(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    deletedAt: timestampSchema.optional(),
  })
  .strict();

export const loopRegionSchema = z
  .discriminatedUnion("labelSource", [
    loopRegionBaseSchema.extend({
      labelSource: z.literal("generated"),
      label: z.string().optional(),
    }),
    loopRegionBaseSchema.extend({
      labelSource: z.literal("user"),
      label: z.string().trim().min(1),
    }),
  ])
  .refine((value) => value.start.tick < value.end.tick, {
    message: "Loop start must precede end",
  });

export const practicePlaybackSidecarSchema = z
  .object({
    scoreSpeed: z
      .object({
        value: z.number().min(0.25).max(2),
        updatedAt: timestampSchema,
      })
      .strict(),
    loops: z.array(loopRegionSchema),
    visibility: z
      .object({
        primaryTrackId: z.string().optional(),
        additionalTrackIds: z.array(z.string()),
        updatedAt: timestampSchema,
      })
      .strict(),
    tracks: z.record(
      z.string(),
      z
        .object({
          muted: z.boolean(),
          volume: z.number().min(0).max(1),
          muteUpdatedAt: timestampSchema,
          volumeUpdatedAt: timestampSchema,
        })
        .strict(),
    ),
  })
  .strict();
