import { z } from "zod";

export const scoreIdentitySchema = z.object({
  contentHash: z.string().regex(/^[a-f0-9]{64}$/i, "Content hash must be a 64-character hexadecimal SHA-256"),
  format: z.enum(["gp", "musicxml", "midi"]),
  title: z.string().optional(),
  artist: z.string().optional(),
  durationMs: z.number().nonnegative().optional(),
  sourceHints: z.object({
    fileName: z.string().optional(),
    trackNames: z.array(z.string()).optional(),
    tempoSummary: z.string().optional(),
  }).strict().optional(),
}).strict();
