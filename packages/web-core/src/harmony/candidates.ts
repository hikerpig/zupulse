import { chordSymbolSchema, type ChordSymbolInput, type ScoreWrittenRange } from "./schemas";
import type { HarmonyFeatureVector } from "./features";
import { learnedBassIntervals, scoreHarmonyCandidate, type HarmonyRankerModel } from "./learnedRanker";

export type HarmonyCandidate = {
  chord: ReturnType<typeof chordSymbolSchema.parse>;
  localScore: number;
  sequenceScore: number;
  confidence: number;
};

type Template = {
  kind: ChordSymbolInput["kind"];
  intervals: readonly number[];
  extension?: ChordSymbolInput["extension"];
  evidence?: readonly number[];
  important?: readonly number[];
  degrees?: ChordSymbolInput["degrees"];
};

const steps = ["C", "C", "D", "D", "E", "F", "F", "G", "G", "A", "A", "B"] as const;
const alters = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0] as const;
const templates: readonly Template[] = [
  { kind: "major", intervals: [0, 4, 7], important: [4] },
  { kind: "minor", intervals: [0, 3, 7], important: [3] },
  { kind: "diminished", intervals: [0, 3, 6], important: [3, 6] },
  { kind: "augmented", intervals: [0, 4, 8], important: [4, 8] },
  { kind: "suspended-second", intervals: [0, 2, 7], important: [2] },
  { kind: "suspended-fourth", intervals: [0, 5, 7], important: [5] },
  {
    kind: "major",
    intervals: [0, 4, 5, 7],
    evidence: [5],
    degrees: [{ operation: "add", value: 4, alter: 0 }],
  },
  ...(["major", "minor"] as const).flatMap((kind) => [
    {
      kind,
      intervals: [0, kind === "major" ? 4 : 3, 7, 2],
      evidence: [2],
      important: [kind === "major" ? 4 : 3],
      degrees: [{ operation: "add" as const, value: 9 as const, alter: 0 as const }],
    },
    {
      kind,
      intervals: [0, kind === "major" ? 4 : 3, 7, 5],
      evidence: [5],
      important: [kind === "major" ? 4 : 3],
      degrees: [{ operation: "add" as const, value: 11 as const, alter: 0 as const }],
    },
    {
      kind,
      intervals: [0, kind === "major" ? 4 : 3, 7, 9],
      evidence: [9],
      important: [kind === "major" ? 4 : 3],
      degrees: [{ operation: "add" as const, value: 13 as const, alter: 0 as const }],
    },
  ]),
  { kind: "power", intervals: [0, 7], important: [7] },
  { kind: "major", extension: 6, intervals: [0, 4, 7, 9], evidence: [4, 9] },
  { kind: "minor", extension: 6, intervals: [0, 3, 7, 9], evidence: [3, 9] },
  { kind: "diminished", extension: 6, intervals: [0, 3, 6, 9], evidence: [3, 6, 9] },
  { kind: "major", extension: 7, intervals: [0, 4, 7, 11], evidence: [4, 11] },
  { kind: "minor", extension: 7, intervals: [0, 3, 7, 10], evidence: [3, 10] },
  { kind: "major", extension: 9, intervals: [0, 2, 4, 7, 11], evidence: [2, 4, 11] },
  { kind: "major", extension: 11, intervals: [0, 2, 4, 5, 7, 11], evidence: [4, 5, 11] },
  { kind: "major", extension: 13, intervals: [0, 2, 4, 5, 7, 9, 11], evidence: [4, 9, 11] },
  { kind: "minor", extension: 9, intervals: [0, 2, 3, 7, 10], evidence: [2, 3, 10] },
  { kind: "minor", extension: 11, intervals: [0, 2, 3, 5, 7, 10], evidence: [3, 5, 10] },
  { kind: "minor", extension: 13, intervals: [0, 2, 3, 5, 7, 9, 10], evidence: [3, 9, 10] },
  { kind: "dominant", extension: 7, intervals: [0, 4, 7, 10], evidence: [4, 10] },
  { kind: "dominant", extension: 9, intervals: [0, 2, 4, 7, 10], evidence: [2, 4, 10] },
  { kind: "dominant", extension: 11, intervals: [0, 2, 4, 5, 7, 10], evidence: [4, 5, 10] },
  { kind: "dominant", extension: 13, intervals: [0, 2, 4, 5, 7, 9, 10], evidence: [4, 9, 10] },
  { kind: "diminished", extension: 7, intervals: [0, 3, 6, 9], evidence: [3, 6, 9] },
  { kind: "half-diminished", extension: 7, intervals: [0, 3, 6, 10], evidence: [3, 6, 10] },
];

export function generateHarmonyCandidates(
  _range: ScoreWrittenRange,
  features: HarmonyFeatureVector,
  options: { topK?: number; rankerModel?: HarmonyRankerModel; rankerWeight?: number } = {},
): HarmonyCandidate[] {
  const topK = Math.max(1, Math.min(8, options.topK ?? 8));
  const maximumDuration = Math.max(1, ...features.durationByPitchClass);
  const totalDuration = features.durationByPitchClass.reduce((sum, duration) => sum + duration, 0);
  const roots =
    options.rankerModel === undefined
      ? features.durationByPitchClass.flatMap((duration, pitchClass) => (duration > 0 ? [pitchClass] : []))
      : learnedRoots(features);
  const candidates = roots.flatMap((root) =>
    templatesForRoot(root, features)
      .filter((template) =>
        options.rankerModel === undefined
          ? (template.evidence ?? []).every((interval) => features.durationByPitchClass[(root + interval) % 12]! > 0)
          : true,
      )
      .flatMap((template) => {
        const pitchClasses = template.intervals.map((interval) => (root + interval) % 12);
        const support = pitchClasses.reduce((sum, pitchClass) => sum + features.durationByPitchClass[pitchClass]!, 0);
        const conflict = totalDuration - support;
        const missing = pitchClasses.filter((pitchClass) => features.durationByPitchClass[pitchClass] === 0).length;
        const missingImportant = (template.important ?? []).filter(
          (interval) => features.durationByPitchClass[(root + interval) % 12] === 0,
        ).length;
        const bassIsChordTone = features.bassPitchClass === undefined || pitchClasses.includes(features.bassPitchClass);
        const bass =
          features.bassPitchClass !== undefined &&
          features.bassPitchClass !== root &&
          (bassIsChordTone || options.rankerModel !== undefined)
            ? pitch(features.bassPitchClass, features.spellingByPitchClass?.[features.bassPitchClass])
            : undefined;
        const upperExtensionComplexity =
          template.extension === 9 ? 1 : template.extension === 11 ? 2 : template.extension === 13 ? 3 : 0;
        const ruleScore =
          support -
          conflict * 0.75 -
          missing * maximumDuration * 0.6 -
          missingImportant * maximumDuration * 1.5 -
          template.intervals.length * maximumDuration * 0.02 -
          (template.degrees?.length ?? 0) * maximumDuration * 2.5 -
          upperExtensionComplexity * maximumDuration * 1.5 -
          (bassIsChordTone ? 0 : maximumDuration * 2) +
          (features.bassPitchClass === root ? maximumDuration * 0.1 : 0);
        const chordInput = {
          root: pitch(root, features.spellingByPitchClass?.[root]),
          kind: template.kind,
          ...(template.extension === undefined ? {} : { extension: template.extension }),
          degrees: template.degrees ?? [],
        };
        const learnedBass =
          options.rankerModel === undefined ? [] : learnedBassIntervals(options.rankerModel, chordInput);
        const chordInputs = [
          { ...chordInput, ...(bass ? { bass } : {}) },
          ...learnedBass.map((interval) => ({
            ...chordInput,
            ...(interval === null
              ? {}
              : {
                  bass: pitch((root + interval) % 12, features.spellingByPitchClass?.[(root + interval) % 12]),
                }),
          })),
        ];
        const chords = [
          ...new Map(chordInputs.map((input) => [JSON.stringify(input), chordSymbolSchema.parse(input)])).values(),
        ];
        return chords.map((chord) => {
          const learnedScore =
            options.rankerModel === undefined ? 0 : scoreHarmonyCandidate(options.rankerModel, features, chord);
          const localScore = ruleScore + learnedScore * maximumDuration * (options.rankerWeight ?? 20);
          const sequenceScore = ruleScore;
          return { chord, localScore, sequenceScore, confidence: 0 };
        });
      }),
  );
  const sorted = candidates.sort(
    (a, b) =>
      b.localScore - a.localScore ||
      a.chord.root.step.localeCompare(b.chord.root.step) ||
      a.chord.root.alter - b.chord.root.alter ||
      a.chord.kind.localeCompare(b.chord.kind) ||
      (a.chord.extension ?? 0) - (b.chord.extension ?? 0),
  );
  const selected =
    options.rankerModel === undefined
      ? sorted.slice(0, topK)
      : selectHybridCandidates(sorted, topK, features.bassPitchClass);
  return selected.map((candidate, index, all) => ({
    ...candidate,
    sequenceScore: candidate.sequenceScore,
    confidence:
      all.length === 1
        ? 1
        : clampConfidence(
            index === 0
              ? 0.5 + (candidate.localScore - all[1]!.localScore) / maximumDuration / 4
              : 0.5 - (all[0]!.localScore - candidate.localScore) / maximumDuration / 4,
          ),
  }));
}

function learnedRoots(features: HarmonyFeatureVector): number[] {
  const sounds = (pitchClass: number) => features.durationByPitchClass[(pitchClass + 12) % 12]! > 0;
  return Array.from({ length: 12 }, (_, root) => root).filter(
    (root) =>
      sounds(root) ||
      (sounds(root + 4) && sounds(root + 7)) ||
      (sounds(root + 3) && sounds(root + 7)) ||
      (sounds(root + 3) && sounds(root + 6)),
  );
}

export function selectHybridCandidates(
  candidates: readonly HarmonyCandidate[],
  topK: number,
  observedBassPitchClass: number | undefined,
): HarmonyCandidate[] {
  const selected: HarmonyCandidate[] = [];
  const counts = new Map<string, number>();
  const learnedSlots = Math.max(1, topK - 2);
  for (const candidate of prioritizeObservedBass(candidates, observedBassPitchClass)) {
    const key = baseChordKey(candidate);
    if ((counts.get(key) ?? 0) >= 2) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    selected.push(candidate);
    if (selected.length === learnedSlots) break;
  }
  for (const candidate of [...candidates].sort((a, b) => b.sequenceScore - a.sequenceScore)) {
    if (selected.includes(candidate)) continue;
    selected.push(candidate);
    if (selected.length === topK) break;
  }
  return selected.sort((a, b) => b.localScore - a.localScore);
}

function prioritizeObservedBass(
  candidates: readonly HarmonyCandidate[],
  observedBassPitchClass: number | undefined,
): HarmonyCandidate[] {
  if (observedBassPitchClass === undefined) return [...candidates];
  const preferredByBase = new Map<string, HarmonyCandidate>();
  for (const candidate of candidates)
    if (candidateBassPitchClass(candidate) === observedBassPitchClass && !preferredByBase.has(baseChordKey(candidate)))
      preferredByBase.set(baseChordKey(candidate), candidate);
  const seenBases = new Set<string>();
  const replacements = new Map<HarmonyCandidate, HarmonyCandidate>();
  return candidates.map((candidate) => {
    const replacement = replacements.get(candidate);
    if (replacement) return replacement;
    const key = baseChordKey(candidate);
    if (seenBases.has(key)) return candidate;
    seenBases.add(key);
    const preferred = preferredByBase.get(key);
    if (!preferred || preferred === candidate) return candidate;
    replacements.set(preferred, candidate);
    return preferred;
  });
}

function candidateBassPitchClass(candidate: HarmonyCandidate): number {
  const pitch = candidate.chord.bass ?? candidate.chord.root;
  const natural = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 } as const;
  return (natural[pitch.step] + pitch.alter + 12) % 12;
}

function baseChordKey(candidate: HarmonyCandidate): string {
  return JSON.stringify({
    root: candidate.chord.root,
    kind: candidate.chord.kind,
    extension: candidate.chord.extension ?? null,
    degrees: candidate.chord.degrees,
  });
}

function pitch(pitchClass: number, sourceSpelling?: ChordSymbolInput["root"]) {
  return sourceSpelling ?? { step: steps[pitchClass]!, alter: alters[pitchClass]! };
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function templatesForRoot(root: number, features: HarmonyFeatureVector): readonly Template[] {
  const sounds = (interval: number) => features.durationByPitchClass[(root + interval) % 12]! > 0;
  if (!sounds(4) || !sounds(10)) return templates;
  const ninths = [
    { interval: 1, value: 9 as const, alter: -1 as const },
    { interval: 3, value: 9 as const, alter: 1 as const },
  ].filter(({ interval }) => sounds(interval));
  const upperAlterations = [
    { interval: 6, value: 11 as const, alter: 1 as const },
    { interval: 8, value: 13 as const, alter: -1 as const },
  ].filter(({ interval }) => sounds(interval));
  const alterationGroups = ninths.length
    ? ninths.map((ninth) => [ninth, ...upperAlterations])
    : upperAlterations.length
      ? [upperAlterations]
      : [];
  const alteredTensions: Template[] = alterationGroups.map((alterations) => ({
    kind: "dominant",
    extension: 7,
    intervals: [0, 4, 7, 10, ...alterations.map(({ interval }) => interval)],
    evidence: [4, 10, ...alterations.map(({ interval }) => interval)],
    degrees: alterations.map(({ value, alter }) => ({ operation: "alter", value, alter })),
  }));
  const alteredFifths: Template[] = [
    { interval: 6, alter: -1 as const },
    { interval: 8, alter: 1 as const },
  ].flatMap(({ interval, alter }) =>
    sounds(interval)
      ? [
          {
            kind: "dominant" as const,
            extension: 7 as const,
            intervals: [0, 4, 10, interval],
            evidence: [4, 10, interval],
            degrees: [{ operation: "alter" as const, value: 5 as const, alter }],
          },
        ]
      : [],
  );
  return [...templates, ...alteredTensions, ...alteredFifths];
}
