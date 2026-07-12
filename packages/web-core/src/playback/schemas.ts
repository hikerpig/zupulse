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

export const loopRegionSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    labelSource: z.enum(["generated", "user"]),
    start: musicalPositionSchema,
    end: musicalPositionSchema,
    snapMode: z.enum(["off", "beat", "measure"]),
    speedOverride: z.number().min(0.25).max(2).optional(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    deletedAt: timestampSchema.optional(),
  })
  .strict()
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
