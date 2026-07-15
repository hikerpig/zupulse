import { chordSymbolSchema, type ScoreWrittenRange } from "./schemas";
import type { HarmonyFeatureVector } from "./features";

export type HarmonyCandidate = {
  chord: ReturnType<typeof chordSymbolSchema.parse>;
  localScore: number;
  sequenceScore: number;
  confidence: number;
};
const steps = ["C", "C", "D", "D", "E", "F", "F", "G", "G", "A", "A", "B"] as const;
const alters = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0] as const;
const pitchClass = (root: number, intervals: readonly number[]) => intervals.map((interval) => (root + interval) % 12);

export function generateHarmonyCandidates(
  _range: ScoreWrittenRange,
  features: HarmonyFeatureVector,
  options: { topK?: number } = {},
): HarmonyCandidate[] {
  const topK = Math.max(1, Math.min(8, options.topK ?? 8));
  const candidates: HarmonyCandidate[] = [];
  for (let root = 0; root < 12; root += 1) {
    const third =
      features.durationByPitchClass[(root + 4) % 12]! >= features.durationByPitchClass[(root + 3) % 12]!
        ? "major"
        : "minor";
    const kinds = [third, "diminished", "power", "suspended-fourth"] as const;
    for (const kind of kinds) {
      const extension =
        kind === "power" || kind === "suspended-fourth" ? undefined : kind === "diminished" ? undefined : undefined;
      const intervals =
        kind === "major"
          ? [0, 4, 7]
          : kind === "minor"
            ? [0, 3, 7]
            : kind === "diminished"
              ? [0, 3, 6]
              : kind === "power"
                ? [0, 7]
                : [0, 5, 7];
      const support = pitchClass(root, intervals).reduce((sum, pc) => sum + features.durationByPitchClass[pc]!, 0);
      const conflict = features.durationByPitchClass.reduce(
        (sum, duration, pc) => sum + (pitchClass(root, intervals).includes(pc) ? 0 : duration),
        0,
      );
      const bassConflict =
        features.bassPitchClass !== undefined && !pitchClass(root, intervals).includes(features.bassPitchClass)
          ? 24
          : 0;
      const bassRootBonus = features.bassPitchClass === root ? 4 : 0;
      const localScore =
        support -
        conflict * 0.35 -
        bassConflict +
        bassRootBonus -
        (kind === "power" ? 20 : kind === "diminished" ? 8 : 0);
      const bass =
        features.bassPitchClass !== undefined &&
        features.bassPitchClass !== root &&
        pitchClass(root, intervals).includes(features.bassPitchClass)
          ? { step: steps[features.bassPitchClass]!, alter: alters[features.bassPitchClass]! }
          : undefined;
      const chord = chordSymbolSchema.parse({
        root: { step: steps[root]!, alter: alters[root]! },
        kind,
        ...(extension ? { extension } : {}),
        degrees: [],
        ...(bass ? { bass } : {}),
      });
      candidates.push({ chord, localScore, sequenceScore: localScore, confidence: 0 });
    }
    const qualityExtensionIntervals =
      third === "major"
        ? ([
            [6, [0, 4, 7, 9]],
            [7, [0, 4, 7, 11]],
          ] as const)
        : ([
            [6, [0, 3, 7, 9]],
            [7, [0, 3, 7, 10]],
          ] as const);
    for (const [extension, extensionIntervals] of qualityExtensionIntervals) {
      if (features.durationByPitchClass[(root + extensionIntervals.at(-1)!) % 12]! <= 0) continue;
      const extensionPitchClasses = pitchClass(root, extensionIntervals);
      const extensionSupport = extensionPitchClasses.reduce((sum, pc) => sum + features.durationByPitchClass[pc]!, 0);
      const conflict = features.durationByPitchClass.reduce(
        (sum, duration, pc) => sum + (extensionPitchClasses.includes(pc) ? 0 : duration),
        0,
      );
      const bassConflict =
        features.bassPitchClass !== undefined && !extensionPitchClasses.includes(features.bassPitchClass) ? 24 : 0;
      const bassRootBonus = features.bassPitchClass === root ? 4 : 0;
      const bass =
        features.bassPitchClass !== undefined &&
        features.bassPitchClass !== root &&
        extensionPitchClasses.includes(features.bassPitchClass)
          ? { step: steps[features.bassPitchClass]!, alter: alters[features.bassPitchClass]! }
          : undefined;
      const chord = chordSymbolSchema.parse({
        root: { step: steps[root]!, alter: alters[root]! },
        kind: third,
        extension,
        degrees: [],
        ...(bass ? { bass } : {}),
      });
      const localScore = extensionSupport - conflict * 0.35 - bassConflict + bassRootBonus - 1;
      candidates.push({ chord, localScore, sequenceScore: localScore, confidence: 0 });
    }
    const diminishedSeventhIntervals = [0, 3, 6, 9] as const;
    if (features.durationByPitchClass[(root + 9) % 12]! > 0) {
      const diminishedPitchClasses = pitchClass(root, diminishedSeventhIntervals);
      const support = diminishedPitchClasses.reduce((sum, pc) => sum + features.durationByPitchClass[pc]!, 0);
      const conflict = features.durationByPitchClass.reduce(
        (sum, duration, pc) => sum + (diminishedPitchClasses.includes(pc) ? 0 : duration),
        0,
      );
      const bassConflict =
        features.bassPitchClass !== undefined && !diminishedPitchClasses.includes(features.bassPitchClass) ? 24 : 0;
      const bassRootBonus = features.bassPitchClass === root ? 4 : 0;
      const chord = chordSymbolSchema.parse({
        root: { step: steps[root]!, alter: alters[root]! },
        kind: "diminished",
        extension: 7,
        degrees: [],
      });
      const localScore = support - conflict * 0.35 - bassConflict + bassRootBonus - 8;
      candidates.push({ chord, localScore, sequenceScore: localScore, confidence: 0 });
    }
    const seventh = features.durationByPitchClass[(root + 10) % 12]!;
    if (seventh > 0) {
      for (const extension of [7, 9, 11, 13] as const) {
        const extensionIntervals =
          extension === 7
            ? [0, 4, 7, 10]
            : extension === 9
              ? [0, 4, 7, 10, 2]
              : extension === 11
                ? [0, 4, 7, 10, 2, 5]
                : [0, 4, 7, 10, 2, 5, 9];
        const extensionSupport = pitchClass(root, extensionIntervals).reduce(
          (sum, pc) => sum + features.durationByPitchClass[pc]!,
          0,
        );
        const alterations =
          extension === 13 && features.durationByPitchClass[(root + 1) % 12]! > 0
            ? [{ operation: "alter" as const, value: 9 as const, alter: -1 as const }]
            : [];
        const chord = chordSymbolSchema.parse({
          root: { step: steps[root]!, alter: alters[root]! },
          kind: "dominant",
          extension,
          degrees: alterations,
        });
        const bassConflict =
          features.bassPitchClass !== undefined &&
          !pitchClass(root, extensionIntervals).includes(features.bassPitchClass)
            ? 24
            : 0;
        const bassRootBonus = features.bassPitchClass === root ? 4 : 0;
        candidates.push({
          chord,
          localScore: extensionSupport - (extension - 7) * 2 - bassConflict + bassRootBonus,
          sequenceScore: extensionSupport - (extension - 7) * 2 - bassConflict + bassRootBonus,
          confidence: 0,
        });
      }
    }
  }
  return candidates
    .sort(
      (a, b) =>
        b.localScore - a.localScore ||
        a.chord.root.step.localeCompare(b.chord.root.step) ||
        a.chord.kind.localeCompare(b.chord.kind),
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
