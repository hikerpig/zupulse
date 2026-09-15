import { correctPitch } from "./pitch";
type Measure = Parameters<typeof correctPitch>[0];
type Heads = Parameters<typeof correctPitch>[1];
type Head = { x: number; y: number; gap: number; pitch: number; staff: number; measure: number };
type Curve = { rect: [number, number, number, number]; status: string; linkedHeads: Head[][] };
type Protection = { unknown: boolean; protectedPitches: number[] };

export function curveProtection(heads: Head[], curves: Curve[], staff: number, measure: number): Protection {
  if (!heads.length) return { unknown: true, protectedPitches: [] };
  const gap = Math.max(...heads.map((h) => h.gap));
  const box = [
    Math.min(...heads.map((h) => h.x)) - 2 * gap,
    Math.min(...heads.map((h) => h.y)) - gap,
    Math.max(...heads.map((h) => h.x)) + 2 * gap,
    Math.max(...heads.map((h) => h.y)) + gap,
  ];
  const intersects = (r: Curve["rect"]) => r[0] <= box[2]! && r[2] >= box[0]! && r[1] <= box[3]! && r[3] >= box[1]!;
  return {
    unknown: curves.some((c) => c.status !== "unique" && intersects(c.rect)),
    protectedPitches: [
      ...new Set(
        curves
          .flatMap((c) => c.linkedHeads.flat())
          .filter((h) => h.staff === staff && h.measure === measure)
          .map((h) => h.pitch),
      ),
    ],
  };
}

export function correctProtectedPitch(input: Measure, heads: Heads, protection: Protection) {
  const reject = (reason: string) => ({
    measure: input,
    changes: [] as ReturnType<typeof correctPitch>["changes"],
    reason,
  });
  if (protection.unknown) return reject("unresolved-nearby-curve");
  const ties = new Map(
    input.voices.flatMap((v) => v.events).flatMap((e) => (e.type === "note" && e.tie ? [[e.id, e.tie] as const] : [])),
  );
  const proposalInput = structuredClone(input);
  // Only the scratch proposal ignores the coarse measure guard; tied events must remain exactly unchanged.
  for (const e of proposalInput.voices.flatMap((v) => v.events)) if (e.type === "note") delete e.tie;
  const result = correctPitch(proposalInput, heads);
  if (result.reason !== "accepted") return reject(result.reason);
  if (result.changes.some((c) => ties.has(c.id))) return reject("changed-tied-note");
  const natural = (p: { step: string; octave: number }) => p.octave * 7 + "CDEFGAB".indexOf(p.step);
  if (
    result.changes.some(
      (c) =>
        protection.protectedPitches.includes(natural(c.before)) ||
        protection.protectedPitches.includes(natural(c.after)),
    )
  )
    return reject("connected-pitch");
  for (const e of result.measure.voices.flatMap((v) => v.events)) {
    const tie = ties.get(e.id);
    if (e.type === "note" && tie) e.tie = tie;
  }
  return result;
}
