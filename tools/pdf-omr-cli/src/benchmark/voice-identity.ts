import { z } from "zod";
import { canonicalJson, sha256Bytes } from "../canonical-json";
import { sha256Schema, type OmrScoreDraft } from "../schemas";
import { alignDraftParts } from "./part-identity";
import { alignExact } from "./symbolic-alignment";
import { computeSymbolicMetrics, flattenEvents, withRates } from "./symbolic-metrics";
import { PdfOmrError } from "../errors";

const count = z.number().int().nonnegative();
const rate = z.number().min(0).max(1);
const metric = z
  .object({ truePositive: count, falsePositive: count, falseNegative: count, precision: rate, recall: rate, f1: rate })
  .strict();
const exact = z.object({ valid: count, total: count, rate }).strict();
const voice = z
  .object({
    originalPartId: z.string().min(1),
    voiceIndex: z.number().int().positive(),
    alignedPartId: z.string().min(1).optional(),
  })
  .strict();
const eventCounts = z.object({ notes: count, rests: count }).strict();
const scopeSchema = z
  .object({ itemId: z.string().min(1), measureRange: z.tuple([count, count]) })
  .strict()
  .refine((s) => s.measureRange[1] > s.measureRange[0], "nonempty expected interval required");
export const voiceIdentityReportSchema = z
  .object({
    version: z.literal("voice-identity-v1"),
    interpretation: z.literal("measurement correction"),
    scope: scopeSchema,
    predictedDraftSha256: sha256Schema,
    expectedDraftSha256: sha256Schema,
    status: z.enum(["unique", "ambiguous", "unavailable"]),
    reason: z
      .enum([
        "multiple-optima",
        "resource-limit",
        "source-identity-invalid",
        "part-alignment-unavailable",
        "interval-invalid",
      ])
      .optional(),
    predictedVoices: z.array(voice),
    expectedVoices: z.array(voice),
    eventCounts: z.object({ predicted: eventCounts, expected: eventCounts }).strict(),
    legacy: z.object({ joint: metric, rest: metric, validMeasure: exact }).strict().optional(),
    mapping: z
      .array(z.object({ predicted: voice, expected: voice, matchedEvents: z.number().int().positive() }).strict())
      .optional(),
    adjusted: z.object({ joint: metric, notes: metric, rests: metric, validMeasure: exact }).strict().optional(),
  })
  .strict()
  .superRefine((r, c) => {
    if (
      r.status === "unique"
        ? !r.adjusted || !r.mapping || !r.legacy || r.reason !== undefined
        : r.adjusted !== undefined || r.mapping !== undefined || r.reason === undefined
    )
      c.addIssue({ code: "custom", message: "mapping availability and metrics disagree" });
    if (
      (r.status === "ambiguous" && (r.reason !== "multiple-optima" || !r.legacy)) ||
      (r.status === "unavailable" && r.reason === "multiple-optima")
    )
      c.addIssue({ code: "custom", message: "reason does not match status" });
    if (r.mapping) {
      const ids = (side: "predicted" | "expected") =>
        r.mapping!.map((m) => JSON.stringify([m[side].originalPartId, m[side].voiceIndex]));
      if (
        new Set(ids("predicted")).size !== r.mapping.length ||
        new Set(ids("expected")).size !== r.mapping.length ||
        r.mapping.some((m) => !m.predicted.alignedPartId || m.predicted.alignedPartId !== m.expected.alignedPartId)
      )
        c.addIssue({ code: "custom", message: "mapping must be one-to-one within aligned parts" });
    }
  });
export type VoiceIdentityReport = z.infer<typeof voiceIdentityReportSchema>;
type Scope = z.infer<typeof scopeSchema>;
type Event = ReturnType<typeof flattenEvents>[number];
type Voice = z.infer<typeof voice>;
type Group = { identity: Voice; events: Event[] };

function groups(source: OmrScoreDraft, aligned: OmrScoreDraft = source): Group[] {
  const result = new Map<string, Group>();
  source.parts.forEach((part, index) => {
    for (const event of flattenEvents({ ...aligned, parts: [aligned.parts[index]!] })) {
      const key = JSON.stringify([part.id, event.voice]);
      const group = result.get(key) ?? {
        identity: { originalPartId: part.id, voiceIndex: event.voice, alignedPartId: event.part },
        events: [],
      };
      group.events.push(event);
      result.set(key, group);
    }
  });
  return [...result.values()];
}
function key(e: Event): string {
  return JSON.stringify([e.part, e.measure, e.staff, e.type, e.pitch, e.onset, e.duration, e.tie, e.tuplet]);
}
function measureKey(e: Pick<Event, "part" | "staff" | "measure">): string {
  return JSON.stringify([e.part, e.staff, e.measure]);
}
function inventory(events: Event[]) {
  return {
    notes: events.filter((e) => e.type === "note").length,
    rests: events.filter((e) => e.type === "rest").length,
  };
}

function identitiesValid(d: OmrScoreDraft): boolean {
  const unique = (values: (string | number)[]) => new Set(values).size === values.length;
  return (
    unique(d.parts.map((p) => p.id)) &&
    d.parts.every(
      (p) =>
        p.id.length > 0 &&
        unique(p.staves.map((s) => s.index)) &&
        p.staves.every(
          (s) =>
            unique(s.measures.map((m) => m.index)) && s.measures.every((m) => unique(m.voices.map((v) => v.index))),
        ),
    )
  );
}

// A whole-item assignment prevents a new mapping at each bar from hiding voice switches.
// The 12-voice bound caps this exact DP at 13 * 2^12 states, without a greedy fallback.
function assignment(weights: number[][]) {
  type State = { score: number; ways: number; next: number };
  const cache = new Map<number, State>();
  function solve(row: number, used: number): State {
    if (row === weights.length) return { score: 0, ways: 1, next: -1 };
    const id = row * 4096 + used,
      cached = cache.get(id);
    if (cached) return cached;
    const skip = solve(row + 1, used);
    let best: State = { ...skip, next: -1 };
    weights[row]!.forEach((weight, column) => {
      if (weight === 0 || (used & (1 << column)) !== 0) return;
      const child = solve(row + 1, used | (1 << column)),
        score = weight + child.score;
      if (score > best.score) best = { score, ways: child.ways, next: column };
      else if (score === best.score) best = { ...best, ways: Math.min(2, best.ways + child.ways) };
    });
    cache.set(id, best);
    return best;
  }
  const optimum = solve(0, 0),
    pairs: Array<[number, number]> = [];
  if (optimum.ways === 1) {
    let used = 0;
    for (let row = 0; row < weights.length; row++) {
      const column = solve(row, used).next;
      if (column >= 0) {
        pairs.push([row, column]);
        used |= 1 << column;
      }
    }
  }
  return { ambiguous: optimum.ways > 1, pairs };
}

export function evaluateVoiceIdentity(
  predicted: OmrScoreDraft,
  expected: OmrScoreDraft,
  scope: Scope,
): VoiceIdentityReport {
  const pRaw = flattenEvents(predicted),
    e = flattenEvents(expected);
  const base = {
    version: "voice-identity-v1" as const,
    interpretation: "measurement correction" as const,
    scope: scopeSchema.parse(scope),
    predictedDraftSha256: sha256Bytes(Buffer.from(canonicalJson(predicted))),
    expectedDraftSha256: sha256Bytes(Buffer.from(canonicalJson(expected))),
    predictedVoices: [] as Voice[],
    expectedVoices: [] as Voice[],
    eventCounts: { predicted: inventory(pRaw), expected: inventory(e) },
  };
  const finish = (fields: Record<string, unknown>) => voiceIdentityReportSchema.parse({ ...base, ...fields });
  if (!identitiesValid(predicted) || !identitiesValid(expected))
    return finish({ status: "unavailable", reason: "source-identity-invalid" });
  base.predictedVoices = groups(predicted).map((g) => ({
    originalPartId: g.identity.originalPartId,
    voiceIndex: g.identity.voiceIndex,
  }));
  base.expectedVoices = groups(expected).map((g) => g.identity);
  if (pRaw.length > 20_000 || e.length > 20_000) return finish({ status: "unavailable", reason: "resource-limit" });
  const [start, end] = scope.measureRange;
  if (
    expected.parts.some((p) =>
      p.staves.some(
        (s) => s.measures.length !== end - start || s.measures.some((m) => m.index < start || m.index >= end),
      ),
    )
  )
    return finish({ status: "unavailable", reason: "interval-invalid" });
  let aligned: OmrScoreDraft;
  try {
    aligned = alignDraftParts(predicted, expected).draft;
  } catch (error) {
    if (!(error instanceof PdfOmrError) || error.code !== "BENCHMARK_EVALUATION_LIMITATION") throw error;
    return finish({ status: "unavailable", reason: "part-alignment-unavailable" });
  }
  const pGroups = groups(predicted, aligned),
    eGroups = groups(expected),
    p = pGroups.flatMap((g) => g.events);
  const metrics = computeSymbolicMetrics(aligned, expected);
  const common = {
    predictedVoices: pGroups.map((g) => g.identity),
    legacy: { joint: metrics.joint, rest: metrics.rest, validMeasure: metrics.validMeasure },
  };
  if (pGroups.length > 12 || eGroups.length > 12)
    return finish({ ...common, status: "unavailable", reason: "resource-limit" });
  const weights = pGroups.map((pg) =>
    eGroups.map((eg) =>
      pg.identity.alignedPartId === eg.identity.alignedPartId
        ? alignExact(pg.events, eg.events, key).matches.length
        : 0,
    ),
  );
  const solved = assignment(weights);
  if (solved.ambiguous) return finish({ ...common, status: "ambiguous", reason: "multiple-optima" });
  const matchedP = new Set<Event>(),
    matchedE = new Set<Event>();
  const mapping = solved.pairs.map(([pi, ei]) => {
    const pg = pGroups[pi]!,
      eg = eGroups[ei]!,
      matches = alignExact(pg.events, eg.events, key).matches;
    for (const m of matches) {
      matchedP.add(pg.events[m.predictedIndex]!);
      matchedE.add(eg.events[m.expectedIndex]!);
    }
    return { predicted: pg.identity, expected: eg.identity, matchedEvents: matches.length };
  });
  const expectedEvents = eGroups.flatMap((g) => g.events);
  function metricFor(type?: "note" | "rest") {
    const select = (event: Event) => type === undefined || event.type === type;
    const tp = [...matchedP].filter(select).length;
    return withRates({
      truePositive: tp,
      falsePositive: p.filter(select).length - tp,
      falseNegative: expectedEvents.filter(select).length - tp,
    });
  }
  const badMeasures = new Set(
    [...p.filter((x) => !matchedP.has(x)), ...expectedEvents.filter((x) => !matchedE.has(x))].map(measureKey),
  );
  const expectedMeasures = expected.parts.flatMap((part) =>
    part.staves.flatMap((staff) =>
      staff.measures.map((m) => measureKey({ part: part.id, staff: staff.index, measure: m.index })),
    ),
  );
  const valid = expectedMeasures.filter((m) => !badMeasures.has(m)).length,
    total = expectedMeasures.length;
  return finish({
    ...common,
    status: "unique",
    mapping,
    adjusted: {
      joint: metricFor(),
      notes: metricFor("note"),
      rests: metricFor("rest"),
      validMeasure: { valid, total, rate: total === 0 ? 1 : valid / total },
    },
  });
}
