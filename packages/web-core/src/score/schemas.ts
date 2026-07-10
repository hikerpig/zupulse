import { z } from "zod";

export const scoreIdentitySchema = z.object({
  contentHash: z.string().min(16).max(128),
  format: z.enum(["gp", "midi"]),
  title: z.string().optional(),
  artist: z.string().optional(),
  durationMs: z.number().nonnegative().optional(),
  sourceHints: z.object({
    fileName: z.string().optional(),
    trackNames: z.array(z.string()).optional(),
    tempoSummary: z.string().optional(),
  }).strict().optional(),
}).strict();
