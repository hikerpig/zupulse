import { z } from "zod";
import { musicalPositionSchema } from "../playback/schemas";

export const libraryScoreIdSchema = z.string().uuid();
export const libraryScoreIdentitySchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, "Score identity must be a lowercase SHA-256 hash");
export const libraryTimestampSchema = z.iso.datetime();
export const libraryFileNameSchema = z.string().trim().min(1).max(255);
export const libraryMetadataSchema = z
  .object({
    titleOverride: z.string().trim().min(1).max(200).optional(),
    artistOverride: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export const libraryPracticeSummarySchema = z
  .object({
    lastPracticedAt: libraryTimestampSchema.optional(),
    lastPosition: musicalPositionSchema.optional(),
    hasLoop: z.boolean(),
  })
  .strict();
