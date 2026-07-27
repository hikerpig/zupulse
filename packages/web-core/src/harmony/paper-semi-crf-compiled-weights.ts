export enum PaperSemiCrfFixedFeature {
  RootCovered,
  ThirdCovered,
  FifthCovered,
  AddedNoteCovered,
  AddedNoteNotCovered,
  AllNotesCovered,
  DurationAddedNoteGreaterThanRoot,
  Count,
}

export enum PaperSemiCrfBinnedFeature {
  Purity,
  AccentedPurity,
  DurationPurity,
  FigPurity,
  FigAccentedPurity,
  FigDurationPurity,
  Count,
}

export enum PaperSemiCrfRole {
  Root,
  Third,
  Fifth,
  AddedNote,
  Count,
}

export enum PaperSemiCrfRoleBinnedFeature {
  DurationCovered,
  FigDurationCovered,
  SegmentDurationCovered,
  AccentCovered,
  FigAccentCovered,
  DurationBassIs,
  AccentBassIs,
  FigDurationBassIs,
  FigAccentBassIs,
  Count,
}

export enum PaperSemiCrfRoleFeature {
  FirstBassIs,
  FigFirstBassIs,
  SegmentBassIs,
  FigSegmentBassIs,
  Count,
}

export type PaperSemiCrfCompiledFeatureWeights = {
  fixed: Float64Array;
  binned: Float64Array[];
  roleBinned: Float64Array[][];
  role: Float64Array[];
  beginningAccent: ReadonlyMap<number, number>;
};

const FIXED_FEATURE_NAMES = [
  "ROOT_COVERED",
  "THIRD_COVERED",
  "FIFTH_COVERED",
  "ADDED_NOTE_COVERED",
  "ADDED_NOTE_NOT_COVERED",
  "ALL_NOTES_COVERED",
  "DURATION_ADDED_NOTE_GREATER_THAN_ROOT",
] as const;

const BINNED_FEATURE_NAMES = [
  "PURITY",
  "ACCENTED_PURITY",
  "DURATION_PURITY",
  "FIG_PURITY",
  "FIG_ACCENTED_PURITY",
  "FIG_DURATION_PURITY",
] as const;

const ROLE_NAMES = ["ROOT", "THIRD", "FIFTH", "ADDED_NOTE"] as const;
const ROLE_BINNED_FEATURE_NAMES = [
  ["DURATION_", "_COVERED"],
  ["FIG_DURATION_", "_COVERED"],
  ["SEGMENT_DURATION_", "_COVERED"],
  ["ACCENT_", "_COVERED"],
  ["FIG_ACCENT_", "_COVERED"],
  ["DURATION_BASS_IS_", ""],
  ["ACCENT_BASS_IS_", ""],
  ["FIG_DURATION_BASS_IS_", ""],
  ["FIG_ACCENT_BASS_IS_", ""],
] as const;
const ROLE_FEATURE_NAMES = [
  ["FIRST_BASS_IS_", ""],
  ["FIG_FIRST_BASS_IS_", ""],
  ["SEGMENT_BASS_IS_", ""],
  ["FIG_SEGMENT_BASS_IS_", ""],
] as const;
const CONSISTENCY_BINS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 101] as const;

export function compilePaperSemiCrfFeatureWeights(input: {
  featureNames: readonly string[];
  weights: readonly number[];
}): PaperSemiCrfCompiledFeatureWeights {
  if (input.weights.length !== input.featureNames.length) {
    throw new Error("paper semi-CRF weights must match feature dictionary");
  }
  if (input.weights.some((weight) => !Number.isFinite(weight))) {
    throw new Error("non-finite paper semi-CRF weight");
  }
  const weightsByName = new Map(input.featureNames.map((name, index) => [name, input.weights[index]!] as const));
  const weight = (name: string): number => weightsByName.get(name) ?? 0;
  const fixed = Float64Array.from(FIXED_FEATURE_NAMES, weight);
  const binned = BINNED_FEATURE_NAMES.map((family) =>
    Float64Array.from(CONSISTENCY_BINS, (bin) => weight(`${family}_${bin}`)),
  );
  const roleBinned = ROLE_BINNED_FEATURE_NAMES.map(([prefix, suffix]) =>
    ROLE_NAMES.map((role) => Float64Array.from(CONSISTENCY_BINS, (bin) => weight(`${prefix}${role}${suffix}_${bin}`))),
  );
  const role = ROLE_FEATURE_NAMES.map(([prefix, suffix]) =>
    Float64Array.from(ROLE_NAMES, (roleName) => weight(`${prefix}${roleName}${suffix}`)),
  );
  const beginningAccent = new Map<number, number>();
  for (const [name, featureWeight] of weightsByName) {
    if (!name.startsWith("BEGINNING_ACCENTED_")) continue;
    const accent = Number(name.slice("BEGINNING_ACCENTED_".length));
    if (Number.isFinite(accent)) beginningAccent.set(accent, featureWeight);
  }
  return { fixed, binned, roleBinned, role, beginningAccent };
}

export function paperSemiCrfConsistencyBinIndex(bin: number): number {
  if (bin === 101) return 11;
  if (Number.isInteger(bin) && bin >= 0 && bin <= 100 && bin % 10 === 0) return bin / 10;
  throw new Error(`unsupported paper Semi-CRF consistency bin: ${bin}`);
}
