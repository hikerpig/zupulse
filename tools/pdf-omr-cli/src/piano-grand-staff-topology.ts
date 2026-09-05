import { z } from "zod";
import { sha256Schema } from "./schemas";

const boundingBoxSchema = z
  .object({
    height: z.number().int().positive(),
    left: z.number().int().nonnegative(),
    top: z.number().int().nonnegative(),
    width: z.number().int().positive(),
  })
  .strict();

const truthSystemSchema = z
  .object({
    boundingBox: boundingBoxSchema,
    visibleStaffCount: z.literal(2),
  })
  .strict();

const truthPageSchema = z
  .object({
    height: z.number().int().positive(),
    pageIndex: z.number().int().nonnegative(),
    renderSha256: sha256Schema,
    systems: z.array(truthSystemSchema).min(1),
    width: z.number().int().positive(),
  })
  .strict();

export const pianoGrandStaffMappingSchema = z
  .object({
    expectedSystemCounts: z.array(z.number().int().positive()),
    pages: z.array(truthPageSchema),
    pdfSha256: sha256Schema,
    reviewBasis: z.string().min(1),
    reviewNote: z.string().min(1),
    schemaVersion: z.literal("1.0.0"),
    workId: z.string().min(1),
  })
  .strict();

export type PianoGrandStaffMapping = z.infer<typeof pianoGrandStaffMappingSchema>;
export type PianoGrandStaffTruthPage = PianoGrandStaffMapping["pages"][number];

export type PianoGrandStaffDetectedSystem = {
  staffCount: number;
  staffLayout: string;
  pixelBBox: { x: number; y: number; width: number; height: number };
};

export function isPianoGrandStaffTopologyExact(
  detected: readonly PianoGrandStaffDetectedSystem[],
  truth: PianoGrandStaffTruthPage,
): boolean {
  if (detected.length !== truth.systems.length) return false;
  return detected.every((system, index) => {
    const expected = truth.systems[index]!;
    if (system.staffCount !== 2 || system.staffLayout !== "grand-staff") return false;
    if (expected.visibleStaffCount !== 2) return false;
    const center = system.pixelBBox.y + system.pixelBBox.height / 2;
    const top = expected.boundingBox.top;
    const bottom = expected.boundingBox.top + expected.boundingBox.height;
    return center >= top && center <= bottom;
  });
}
