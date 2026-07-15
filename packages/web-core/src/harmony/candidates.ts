import { chordSymbolSchema, type ChordSymbolInput, type ScoreWrittenRange } from "./schemas";
import type { HarmonyFeatureVector } from "./features";

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
  options: { topK?: number } = {},
): HarmonyCandidate[] {
  const topK = Math.max(1, Math.min(8, options.topK ?? 8));
  const maximumDuration = Math.max(1, ...features.durationByPitchClass);
  const totalDuration = features.durationByPitchClass.reduce((sum, duration) => sum + duration, 0);
  const roots = features.durationByPitchClass.flatMap((duration, pitchClass) => (duration > 0 ? [pitchClass] : []));
  const candidates = roots.flatMap((root) =>
    templatesForRoot(root, features)
      .filter((template) =>
        (template.evidence ?? []).every((interval) => features.durationByPitchClass[(root + interval) % 12]! > 0),
      )
      .map((template) => {
        const pitchClasses = template.intervals.map((interval) => (root + interval) % 12);
        const support = pitchClasses.reduce((sum, pitchClass) => sum + features.durationByPitchClass[pitchClass]!, 0);
        const conflict = totalDuration - support;
        const missing = pitchClasses.filter((pitchClass) => features.durationByPitchClass[pitchClass] === 0).length;
        const missingImportant = (template.important ?? []).filter(
          (interval) => features.durationByPitchClass[(root + interval) % 12] === 0,
        ).length;
        const bassIsChordTone = features.bassPitchClass === undefined || pitchClasses.includes(features.bassPitchClass);
        const bass =
          features.bassPitchClass !== undefined && features.bassPitchClass !== root && bassIsChordTone
            ? pitch(features.bassPitchClass)
            : undefined;
        const upperExtensionComplexity =
          template.extension === 9 ? 1 : template.extension === 11 ? 2 : template.extension === 13 ? 3 : 0;
        const localScore =
          support -
          conflict * 0.75 -
          missing * maximumDuration * 0.6 -
          missingImportant * maximumDuration * 1.5 -
          template.intervals.length * maximumDuration * 0.02 -
          (template.degrees?.length ?? 0) * maximumDuration * 2.5 -
          upperExtensionComplexity * maximumDuration * 1.5 -
          (bassIsChordTone ? 0 : maximumDuration * 2) +
          (features.bassPitchClass === root ? maximumDuration * 0.1 : 0);
        const chord = chordSymbolSchema.parse({
          root: pitch(root),
          kind: template.kind,
          ...(template.extension === undefined ? {} : { extension: template.extension }),
          degrees: template.degrees ?? [],
          ...(bass ? { bass } : {}),
        });
        return { chord, localScore, sequenceScore: localScore, confidence: 0 };
      }),
  );
  return candidates
    .sort(
      (a, b) =>
        b.localScore - a.localScore ||
        a.chord.root.step.localeCompare(b.chord.root.step) ||
        a.chord.root.alter - b.chord.root.alter ||
        a.chord.kind.localeCompare(b.chord.kind) ||
        (a.chord.extension ?? 0) - (b.chord.extension ?? 0),
    )
    .slice(0, topK)
    .map((candidate, index, all) => ({
      ...candidate,
      confidence:
        all.length === 1
          ? 1
          : Math.max(
              0,
              Math.min(
                1,
                0.5 + (candidate.localScore - (all[index + 1]?.localScore ?? candidate.localScore - 1)) / 100,
              ),
            ),
    }));
}

function pitch(pitchClass: number) {
  return { step: steps[pitchClass]!, alter: alters[pitchClass]! };
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
