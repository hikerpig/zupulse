import { z } from "zod";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const reviewedWrittenPitchSchema = z
  .object({
    step: z.enum(["A", "B", "C", "D", "E", "F", "G"]),
    alter: z.number().int().min(-2).max(2),
    octave: z.number().int().min(-1).max(9),
  })
  .strict();

export const fusionDecisionSetSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    fusionRun: z
      .object({
        runId: z.string().min(1),
        runManifestSha256: sha256Schema,
        repairProposalsSha256: sha256Schema,
      })
      .strict(),
    decisions: z.array(
      z
        .object({
          proposalId: z.string().min(1),
          action: z.enum(["apply", "reject"]),
          writtenPitch: reviewedWrittenPitchSchema.optional(),
          comment: z.string().min(1).optional(),
        })
        .strict()
        .superRefine((decision, context) => {
          if (decision.action === "apply" && decision.writtenPitch === undefined) {
            context.addIssue({ code: "custom", path: ["writtenPitch"], message: "apply requires writtenPitch" });
          }
          if (decision.action === "reject" && decision.writtenPitch !== undefined) {
            context.addIssue({ code: "custom", path: ["writtenPitch"], message: "reject cannot include writtenPitch" });
          }
        }),
    ),
  })
  .strict()
  .superRefine((value, context) => {
    const seen = new Set<string>();
    value.decisions.forEach((decision, index) => {
      if (seen.has(decision.proposalId)) {
        context.addIssue({ code: "custom", path: ["decisions", index, "proposalId"], message: "duplicate proposalId" });
      }
      seen.add(decision.proposalId);
    });
  });

const noteFactsSchema = z
  .object({
    writtenPitch: reviewedWrittenPitchSchema,
    voice: z.number().int().positive(),
    staff: z.number().int().positive(),
    durationUnits: z.number().int().positive(),
    chord: z.boolean(),
    tieTypes: z.array(z.string().min(1)),
  })
  .strict();

const locatorSchema = z
  .object({
    rootFilePath: z.string().min(1).nullable(),
    partId: z.string().min(1),
    measureIndex: z.number().int().nonnegative(),
    noteIndex: z.number().int().nonnegative(),
    preconditionSha256: sha256Schema,
  })
  .strict();

export const patchPlanSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    entries: z.array(
      z
        .object({
          proposalId: z.string().min(1),
          decision: z.enum(["applied", "rejected", "unreviewed"]),
          target: locatorSchema.optional(),
          before: noteFactsSchema.optional(),
          after: noteFactsSchema.optional(),
          reasons: z.array(z.string().min(1)),
        })
        .strict(),
    ),
  })
  .strict();

export type FusionDecisionSet = z.infer<typeof fusionDecisionSetSchema>;
export type ReviewedWrittenPitch = z.infer<typeof reviewedWrittenPitchSchema>;
export type PatchPlan = z.infer<typeof patchPlanSchema>;
