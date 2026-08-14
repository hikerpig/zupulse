import { z } from "zod";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const midiRebuildReportSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    command: z.literal("rebuild-from-midi"),
    status: z.literal("succeeded"),
    runId: z.string().min(1),
    museScoreVersion: z.string().min(1),
    measureCount: z.number().int().positive(),
    noteCount: z.number().int().positive(),
    correctedScoreSha256: sha256Schema,
  })
  .strict();

export type MidiRebuildReport = z.infer<typeof midiRebuildReportSchema>;
