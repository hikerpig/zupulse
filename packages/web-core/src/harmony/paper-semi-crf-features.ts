import type { PaperSemiCrfEvent, PaperSemiCrfEventNote } from "./paper-semi-crf-events";
import type { PaperSemiCrfSupportedLabel } from "./paper-semi-crf-labels";
import {
  compilePaperSemiCrfFeatureWeights,
  PaperSemiCrfBinnedFeature,
  type PaperSemiCrfCompiledFeatureWeights,
  PaperSemiCrfFixedFeature,
  PaperSemiCrfRole,
  PaperSemiCrfRoleBinnedFeature,
  PaperSemiCrfRoleFeature,
  paperSemiCrfConsistencyBinIndex,
} from "./paper-semi-crf-compiled-weights";
import {
  PAPER_SEMI_CRF_FEATURE_VERSION,
  type PaperSemiCrfFeature,
  type PaperSemiCrfFeatureProvider,
  type PaperSemiCrfLocalPotential,
  type PaperSemiCrfLocalPotentialInput,
  type PaperSemiCrfSegment,
} from "./paper-semi-crf-model";

type FeatureWeight = "count" | "accent" | "duration";

type ChordRoles = {
  root: readonly number[];
  third: readonly number[];
  fifth: readonly number[];
  added: readonly number[];
};

export type PaperSemiCrfFeatureDictionary = {
  featureVersion: typeof PAPER_SEMI_CRF_FEATURE_VERSION;
  featureNames: string[];
};

export type PaperSemiCrfNamedFeatureProvider = (input: PaperSemiCrfLocalPotentialInput) => string[];

const featureDictionaryIndices = new WeakMap<PaperSemiCrfFeatureDictionary, ReadonlyMap<string, number>>();

export function createPaperSemiCrfNamedFeatureProvider(input: {
  events: readonly PaperSemiCrfEvent[];
  labels: readonly PaperSemiCrfSupportedLabel[];
}): PaperSemiCrfNamedFeatureProvider {
  const labelsById = new Map(input.labels.map((label) => [label.id, label]));
  return (localInput) => {
    const label = labelsById.get(localInput.segment.labelId);
    if (!label) throw new Error("missing paper semi-CRF label");
    const segmentFeatures = extractPaperSemiCrfSegmentFeatures({
      events: input.events,
      segment: localInput.segment,
      label,
    });
    if (localInput.previousLabelId === undefined) return segmentFeatures;
    const previousLabel = labelsById.get(localInput.previousLabelId);
    if (!previousLabel) throw new Error("missing paper semi-CRF previous label");
    return [...segmentFeatures, extractPaperSemiCrfTransitionFeature(label, previousLabel)];
  };
}

export function extractPaperSemiCrfTransitionFeature(
  current: PaperSemiCrfSupportedLabel,
  previous: PaperSemiCrfSupportedLabel,
): string {
  const currentMode = paperModeAndAddedNote(current);
  const previousMode = paperModeAndAddedNote(previous);
  const currentRoot = pitchClass(current.chord.root.step, current.chord.root.alter);
  const previousRoot = pitchClass(previous.chord.root.step, previous.chord.root.alter);
  return `CHORD_BIGRAM_${currentMode}_${previousMode}_${mod12(currentRoot - previousRoot)}`;
}

export function createPaperSemiCrfFeatureDictionary(featureNames: readonly string[]): PaperSemiCrfFeatureDictionary {
  const unique = [...new Set(featureNames)];
  unique.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  return { featureVersion: PAPER_SEMI_CRF_FEATURE_VERSION, featureNames: unique };
}

export function createPaperSemiCrfFeatureProvider(input: {
  events: readonly PaperSemiCrfEvent[];
  labels: readonly PaperSemiCrfSupportedLabel[];
  dictionary: PaperSemiCrfFeatureDictionary;
}): PaperSemiCrfFeatureProvider {
  const named = createPaperSemiCrfNamedFeatureProvider(input);
  return (localInput) => encodePaperSemiCrfNamedFeatures(input.dictionary, named(localInput));
}

export function createPaperSemiCrfFactorizedLinearPotential(input: {
  events: readonly PaperSemiCrfEvent[];
  labels: readonly PaperSemiCrfSupportedLabel[];
  dictionary: PaperSemiCrfFeatureDictionary;
  weights: readonly number[];
}): PaperSemiCrfLocalPotential {
  const scorers = createPaperSemiCrfFactorizedLinearScorers(input);
  const segmentScores = new Map<number, number>();
  const eventStride = input.events.length + 1;
  const labelStride = input.labels.length;
  return ({ segment, previousLabelId }) => {
    const segmentKey = (segment.startEvent * eventStride + segment.endEvent) * labelStride + segment.labelId;
    let segmentScore = segmentScores.get(segmentKey);
    if (segmentScore === undefined) {
      segmentScore = scorers.segmentPotential(segment);
      segmentScores.set(segmentKey, segmentScore);
    }
    return (
      segmentScore + (previousLabelId === undefined ? 0 : scorers.transitionPotential(segment.labelId, previousLabelId))
    );
  };
}

export function createPaperSemiCrfFactorizedLinearScorers(input: {
  events: readonly PaperSemiCrfEvent[];
  labels: readonly PaperSemiCrfSupportedLabel[];
  dictionary: PaperSemiCrfFeatureDictionary;
  weights: readonly number[];
}): {
  segmentPotential: (segment: PaperSemiCrfSegment) => number;
  transitionPotential: (currentLabelId: number, previousLabelId: number) => number;
} {
  if (input.weights.length !== input.dictionary.featureNames.length) {
    throw new Error("paper semi-CRF weights must match feature dictionary");
  }
  if (input.weights.some((weight) => !Number.isFinite(weight))) {
    throw new Error("non-finite paper semi-CRF weight");
  }
  const compiledWeights = compilePaperSemiCrfFeatureWeights({
    featureNames: input.dictionary.featureNames,
    weights: input.weights,
  });
  const labelsById = new Map(input.labels.map((label) => [label.id, label]));
  const accumulator = new CompiledFeatureAccumulator(compiledWeights);
  const segmentPotential = (segment: PaperSemiCrfSegment) => {
    const label = labelsById.get(segment.labelId);
    if (!label) throw new Error("missing paper semi-CRF label");
    accumulator.reset();
    collectPaperSemiCrfSegmentFeatures({ events: input.events, segment, label }, accumulator);
    return accumulator.score;
  };
  const transitionScores = Float64Array.from({ length: input.labels.length * input.labels.length }, (_, index) => {
    const currentLabelId = Math.floor(index / input.labels.length);
    const previousLabelId = index % input.labels.length;
    const current = labelsById.get(currentLabelId);
    const previous = labelsById.get(previousLabelId);
    if (!current || !previous) throw new Error("missing paper semi-CRF transition label");
    const featureIndex = input.dictionary.featureNames.indexOf(extractPaperSemiCrfTransitionFeature(current, previous));
    return featureIndex < 0 ? 0 : input.weights[featureIndex]!;
  });
  const transitionPotential = (currentLabelId: number, previousLabelId: number) => {
    const transitionScore = transitionScores[currentLabelId * input.labels.length + previousLabelId];
    if (transitionScore === undefined) throw new Error("missing paper semi-CRF transition label");
    return transitionScore;
  };
  return { segmentPotential, transitionPotential };
}

export function encodePaperSemiCrfNamedFeatures(
  dictionary: PaperSemiCrfFeatureDictionary,
  featureNames: readonly string[],
): PaperSemiCrfFeature[] {
  let indices = featureDictionaryIndices.get(dictionary);
  if (indices === undefined) {
    indices = new Map(dictionary.featureNames.map((name, index) => [name, index]));
    featureDictionaryIndices.set(dictionary, indices);
  }
  const counts = new Map<number, number>();
  for (const name of featureNames) {
    const index = indices.get(name);
    if (index !== undefined) counts.set(index, (counts.get(index) ?? 0) + 1);
  }
  return [...counts].map(([index, value]) => ({ index, value }));
}

export function extractPaperSemiCrfSegmentFeatures(input: {
  events: readonly PaperSemiCrfEvent[];
  segment: PaperSemiCrfSegment;
  label: PaperSemiCrfSupportedLabel;
}): string[] {
  const sink = new NamedFeatureSink();
  collectPaperSemiCrfSegmentFeatures(input, sink);
  return sink.features;
}

function collectPaperSemiCrfSegmentFeatures(
  input: {
    events: readonly PaperSemiCrfEvent[];
    segment: PaperSemiCrfSegment;
    label: PaperSemiCrfSupportedLabel;
  },
  sink: SegmentFeatureSink,
): void {
  if (
    input.segment.labelId !== input.label.id ||
    input.segment.startEvent < 0 ||
    input.segment.endEvent > input.events.length ||
    input.segment.startEvent >= input.segment.endEvent
  ) {
    throw new Error("invalid paper semi-CRF feature segment");
  }
  const events = input.events.slice(input.segment.startEvent, input.segment.endEvent);
  const notes = notesInSegment(events);
  const roles = chordRoles(input.label);
  const chordPitchClasses = new Set([...roles.root, ...roles.third, ...roles.fifth, ...roles.added]);
  const nonFigurationNotes = notesWithoutFiguration(input.events, input.segment, chordPitchClasses);
  sink.binned(PaperSemiCrfBinnedFeature.Purity, purityBin(notes, events, chordPitchClasses, "count"));
  sink.binned(PaperSemiCrfBinnedFeature.AccentedPurity, purityBin(notes, events, chordPitchClasses, "accent"));
  sink.binned(PaperSemiCrfBinnedFeature.DurationPurity, purityBin(notes, events, chordPitchClasses, "duration"));
  sink.binned(PaperSemiCrfBinnedFeature.FigPurity, purityBin(nonFigurationNotes, events, chordPitchClasses, "count"));
  sink.binned(
    PaperSemiCrfBinnedFeature.FigAccentedPurity,
    purityBin(nonFigurationNotes, events, chordPitchClasses, "accent"),
  );
  sink.binned(
    PaperSemiCrfBinnedFeature.FigDurationPurity,
    purityBin(nonFigurationNotes, events, chordPitchClasses, "duration"),
  );
  const rootCovered = coversRole(notes, roles.root);
  const thirdCovered = coversRole(notes, roles.third);
  const fifthCovered = coversRole(notes, roles.fifth);
  const addedCovered = coversRole(notes, roles.added);
  if (rootCovered) sink.fixed(PaperSemiCrfFixedFeature.RootCovered);
  if (thirdCovered) sink.fixed(PaperSemiCrfFixedFeature.ThirdCovered);
  if (fifthCovered) sink.fixed(PaperSemiCrfFixedFeature.FifthCovered);
  if (roles.added.length > 0) {
    sink.fixed(addedCovered ? PaperSemiCrfFixedFeature.AddedNoteCovered : PaperSemiCrfFixedFeature.AddedNoteNotCovered);
  }
  if (rootCovered && thirdCovered && fifthCovered && (roles.added.length === 0 || addedCovered)) {
    sink.fixed(PaperSemiCrfFixedFeature.AllNotesCovered);
  }
  if (roles.added.length > 0 && addedDurationExceedsRoot(notes, roles)) {
    sink.fixed(PaperSemiCrfFixedFeature.DurationAddedNoteGreaterThanRoot);
  }
  const roleEntries = [
    { role: PaperSemiCrfRole.Root, pitchClasses: roles.root },
    { role: PaperSemiCrfRole.Third, pitchClasses: roles.third },
    { role: PaperSemiCrfRole.Fifth, pitchClasses: roles.fifth },
    { role: PaperSemiCrfRole.AddedNote, pitchClasses: roles.added },
  ] as const;
  for (const role of roleEntries) {
    sink.roleBinned(
      PaperSemiCrfRoleBinnedFeature.DurationCovered,
      role.role,
      weightedCoverageBin(notes, events, role.pitchClasses, "duration"),
    );
    sink.roleBinned(
      PaperSemiCrfRoleBinnedFeature.FigDurationCovered,
      role.role,
      weightedCoverageBin(nonFigurationNotes, events, role.pitchClasses, "duration"),
    );
    sink.roleBinned(
      PaperSemiCrfRoleBinnedFeature.SegmentDurationCovered,
      role.role,
      segmentDurationCoverageBin(events, role.pitchClasses),
    );
  }
  for (const role of roleEntries) {
    sink.roleBinned(
      PaperSemiCrfRoleBinnedFeature.AccentCovered,
      role.role,
      weightedCoverageBin(notes, events, role.pitchClasses, "accent"),
    );
    sink.roleBinned(
      PaperSemiCrfRoleBinnedFeature.FigAccentCovered,
      role.role,
      weightedCoverageBin(nonFigurationNotes, events, role.pitchClasses, "accent"),
    );
  }
  sink.beginningAccent(events[0]!.metricAccent);
  const firstBass = lowestNote(events[0]!.notes);
  const segmentBass = lowestNote(notes);
  const firstNonFigurationNotes = notesWithoutFiguration(
    input.events,
    { ...input.segment, endEvent: input.segment.startEvent + 1 },
    chordPitchClasses,
  );
  const firstNonFigurationBass = lowestNote(firstNonFigurationNotes);
  const segmentNonFigurationBass = lowestNote(nonFigurationNotes);
  const nonFigurationBassNotes = events.map((_, index) =>
    lowestNote(
      notesWithoutFiguration(
        input.events,
        {
          ...input.segment,
          startEvent: input.segment.startEvent + index,
          endEvent: input.segment.startEvent + index + 1,
        },
        chordPitchClasses,
      ),
    ),
  );
  for (const role of roleEntries) {
    if (firstBass && role.pitchClasses.includes(firstBass.soundingPitchClass)) {
      sink.role(PaperSemiCrfRoleFeature.FirstBassIs, role.role);
    }
  }
  for (const role of roleEntries) {
    if (firstNonFigurationBass && role.pitchClasses.includes(firstNonFigurationBass.soundingPitchClass)) {
      sink.role(PaperSemiCrfRoleFeature.FigFirstBassIs, role.role);
    }
  }
  for (const role of roleEntries) {
    if (segmentBass && role.pitchClasses.includes(segmentBass.soundingPitchClass)) {
      sink.role(PaperSemiCrfRoleFeature.SegmentBassIs, role.role);
    }
  }
  for (const role of roleEntries) {
    if (segmentNonFigurationBass && role.pitchClasses.includes(segmentNonFigurationBass.soundingPitchClass)) {
      sink.role(PaperSemiCrfRoleFeature.FigSegmentBassIs, role.role);
    }
  }
  for (const role of roleEntries) {
    sink.roleBinned(
      PaperSemiCrfRoleBinnedFeature.DurationBassIs,
      role.role,
      weightedBassBin(events, role.pitchClasses, "duration"),
    );
  }
  for (const role of roleEntries) {
    sink.roleBinned(
      PaperSemiCrfRoleBinnedFeature.AccentBassIs,
      role.role,
      weightedBassBin(events, role.pitchClasses, "accent"),
    );
  }
  for (const role of roleEntries) {
    sink.roleBinned(
      PaperSemiCrfRoleBinnedFeature.FigDurationBassIs,
      role.role,
      weightedBassBin(events, role.pitchClasses, "duration", nonFigurationBassNotes),
    );
  }
  for (const role of roleEntries) {
    sink.roleBinned(
      PaperSemiCrfRoleBinnedFeature.FigAccentBassIs,
      role.role,
      weightedBassBin(events, role.pitchClasses, "accent", nonFigurationBassNotes),
    );
  }
}

type FixedFeature = Exclude<PaperSemiCrfFixedFeature, PaperSemiCrfFixedFeature.Count>;
type BinnedFeature = Exclude<PaperSemiCrfBinnedFeature, PaperSemiCrfBinnedFeature.Count>;
type Role = Exclude<PaperSemiCrfRole, PaperSemiCrfRole.Count>;
type RoleBinnedFeature = Exclude<PaperSemiCrfRoleBinnedFeature, PaperSemiCrfRoleBinnedFeature.Count>;
type RoleFeature = Exclude<PaperSemiCrfRoleFeature, PaperSemiCrfRoleFeature.Count>;

type SegmentFeatureSink = {
  fixed(feature: FixedFeature): void;
  binned(feature: BinnedFeature, bin: number): void;
  roleBinned(feature: RoleBinnedFeature, role: Role, bin: number): void;
  role(feature: RoleFeature, role: Role): void;
  beginningAccent(accent: number): void;
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

class NamedFeatureSink implements SegmentFeatureSink {
  readonly features: string[] = [];

  fixed(feature: FixedFeature): void {
    this.features.push(FIXED_FEATURE_NAMES[feature]!);
  }

  binned(feature: BinnedFeature, bin: number): void {
    this.features.push(`${BINNED_FEATURE_NAMES[feature]}_${bin}`);
  }

  roleBinned(feature: RoleBinnedFeature, role: Role, bin: number): void {
    const [prefix, suffix] = ROLE_BINNED_FEATURE_NAMES[feature]!;
    this.features.push(`${prefix}${ROLE_NAMES[role]}${suffix}_${bin}`);
  }

  role(feature: RoleFeature, role: Role): void {
    const [prefix, suffix] = ROLE_FEATURE_NAMES[feature]!;
    this.features.push(`${prefix}${ROLE_NAMES[role]}${suffix}`);
  }

  beginningAccent(accent: number): void {
    this.features.push(`BEGINNING_ACCENTED_${formatReferenceDouble(accent)}`);
  }
}

class CompiledFeatureAccumulator implements SegmentFeatureSink {
  score = 0;

  constructor(private readonly weights: PaperSemiCrfCompiledFeatureWeights) {}

  reset(): void {
    this.score = 0;
  }

  fixed(feature: FixedFeature): void {
    this.score += this.weights.fixed[feature]!;
  }

  binned(feature: BinnedFeature, bin: number): void {
    this.score += this.weights.binned[feature]![paperSemiCrfConsistencyBinIndex(bin)]!;
  }

  roleBinned(feature: RoleBinnedFeature, role: Role, bin: number): void {
    this.score += this.weights.roleBinned[feature]![role]![paperSemiCrfConsistencyBinIndex(bin)]!;
  }

  role(feature: RoleFeature, role: Role): void {
    this.score += this.weights.role[feature]![role]!;
  }

  beginningAccent(accent: number): void {
    this.score += this.weights.beginningAccent.get(accent) ?? 0;
  }
}

export function paperSemiCrfConsistencyBin(input: {
  matching: number;
  total: number;
  matchedCount: number;
  noteCount: number;
}): number {
  if (input.matchedCount === 0) return 0;
  if (input.matchedCount === input.noteCount) return 101;
  const percentage = input.matching / input.total;
  const bins = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
  for (const bin of bins) {
    if (percentage <= bin) return bin * 100;
  }
  return 0;
}

function purityBin(
  notes: readonly PaperSemiCrfEventNote[],
  events: readonly PaperSemiCrfEvent[],
  chordPitchClasses: ReadonlySet<number>,
  weight: FeatureWeight,
): number {
  let total = 0;
  let matching = 0;
  let matchedCount = 0;
  for (const note of notes) {
    const value = noteWeight(note, events[0]!, weight);
    total += value;
    if (chordPitchClasses.has(note.soundingPitchClass)) {
      matching += value;
      matchedCount += 1;
    }
  }
  return paperSemiCrfConsistencyBin({ matching, total, matchedCount, noteCount: notes.length });
}

function notesInSegment(events: readonly PaperSemiCrfEvent[]): PaperSemiCrfEventNote[] {
  return events.flatMap((event, index) => event.notes.filter((note) => index === 0 || !note.heldFromPrevious));
}

function noteWeight(note: PaperSemiCrfEventNote, firstEvent: PaperSemiCrfEvent, weight: FeatureWeight): number {
  if (weight === "count") return 1;
  if (weight === "accent") return note.heldFromPrevious ? 0 : note.metricAccent;
  return note.heldFromPrevious
    ? note.sourceDurationTicks - (firstEvent.startTick - note.onsetTick)
    : note.sourceDurationTicks;
}

function coversRole(notes: readonly PaperSemiCrfEventNote[], role: readonly number[]): boolean {
  return role.length > 0 && notes.some((note) => role.includes(note.soundingPitchClass));
}

function weightedCoverageBin(
  notes: readonly PaperSemiCrfEventNote[],
  events: readonly PaperSemiCrfEvent[],
  role: readonly number[],
  weight: Exclude<FeatureWeight, "count">,
): number {
  if (role.length === 0) return 0;
  let total = 0;
  let matching = 0;
  let matchedCount = 0;
  for (const note of notes) {
    const value = noteWeight(note, events[0]!, weight);
    total += value;
    if (role.includes(note.soundingPitchClass)) {
      matching += value;
      matchedCount += 1;
    }
  }
  return paperSemiCrfConsistencyBin({ matching, total, matchedCount, noteCount: notes.length });
}

function segmentDurationCoverageBin(events: readonly PaperSemiCrfEvent[], role: readonly number[]): number {
  if (role.length === 0) return 0;
  const coveredEvents = events.filter((event) => event.notes.some((note) => role.includes(note.soundingPitchClass)));
  return paperSemiCrfConsistencyBin({
    matching: coveredEvents.reduce((sum, event) => sum + event.durationTicks, 0),
    total: events.reduce((sum, event) => sum + event.durationTicks, 0),
    matchedCount: coveredEvents.length,
    noteCount: events.length,
  });
}

function addedDurationExceedsRoot(notes: readonly PaperSemiCrfEventNote[], roles: ChordRoles): boolean {
  const durationFor = (role: readonly number[]): number =>
    notes
      .filter((note) => role.includes(note.soundingPitchClass))
      .reduce((sum, note) => sum + note.sourceDurationTicks, 0);
  return durationFor(roles.added) > durationFor(roles.root);
}

function weightedBassBin(
  events: readonly PaperSemiCrfEvent[],
  role: readonly number[],
  weight: Exclude<FeatureWeight, "count">,
  bassNotes?: readonly (PaperSemiCrfEventNote | undefined)[],
): number {
  if (role.length === 0) return 0;
  let matching = 0;
  let total = 0;
  let matchedCount = 0;
  for (const [index, event] of events.entries()) {
    const eventWeight = weight === "duration" ? event.durationTicks : event.metricAccent;
    const bass = bassNotes ? bassNotes[index] : lowestNote(event.notes);
    total += eventWeight;
    if (bass && role.includes(bass.soundingPitchClass)) {
      matching += eventWeight;
      matchedCount += 1;
    }
  }
  return paperSemiCrfConsistencyBin({
    matching,
    total,
    matchedCount,
    noteCount: events.length,
  });
}

function notesWithoutFiguration(
  allEvents: readonly PaperSemiCrfEvent[],
  segment: PaperSemiCrfSegment,
  chordPitchClasses: ReadonlySet<number>,
): PaperSemiCrfEventNote[] {
  const events = allEvents.slice(segment.startEvent, segment.endEvent);
  const result = [...notesInSegment(events)];
  const previousEvent = allEvents[segment.startEvent - 1];
  const nextEvent = allEvents[segment.endEvent];
  const firstEvent = events[0]!;
  const lastEvent = events.at(-1)!;

  if (previousEvent) {
    for (const firstNote of firstEvent.notes) {
      for (const previousNote of previousEvent.notes) {
        if (
          samePitch(firstNote, previousNote) &&
          firstNote.onsetTick === previousNote.onsetTick + previousNote.sourceDurationTicks &&
          !chordPitchClasses.has(firstNote.soundingPitchClass) &&
          firstNote.sourceDurationTicks <= previousNote.sourceDurationTicks &&
          isHarmonic(previousNote, previousEvent.notes)
        ) {
          removeMatchingNote(result, firstNote);
        }
      }
    }
  }

  if (nextEvent) {
    for (const lastNote of lastEvent.notes) {
      for (const nextNote of nextEvent.notes) {
        if (
          samePitch(lastNote, nextNote) &&
          lastNote.onsetTick + lastNote.sourceDurationTicks === nextNote.onsetTick &&
          !chordPitchClasses.has(lastNote.soundingPitchClass) &&
          lastNote.sourceDurationTicks <= nextNote.sourceDurationTicks &&
          isHarmonic(nextNote, nextEvent.notes)
        ) {
          removeMatchingNote(result, lastNote);
        }
      }
    }
  }

  const emptyEvent = (): PaperSemiCrfEvent => ({
    index: -1,
    range: {
      start: { measureIndex: 0, offsetTicks: 0 },
      end: { measureIndex: 0, offsetTicks: 1 },
    },
    startTick: 0,
    endTick: 1,
    durationTicks: 1,
    metricAccent: 0,
    notes: [],
  });
  const before = previousEvent ?? emptyEvent();
  const after = nextEvent ?? emptyEvent();
  const contextualEvents = [before, ...events, after];
  for (let index = 0; index < contextualEvents.length - 2; index += 1) {
    const currentEvent = contextualEvents[index]!;
    const middleEvent = contextualEvents[index + 1]!;
    const finalEvent = contextualEvents[index + 2]!;
    for (const currentNote of currentEvent.notes) {
      let harmonicCount =
        currentEvent !== before && chordPitchClasses.has(currentNote.soundingPitchClass)
          ? 1
          : Number(isHarmonic(currentNote, currentEvent.notes));
      let belongsToSegment = currentEvent !== before && chordPitchClasses.has(currentNote.soundingPitchClass) ? 1 : 0;
      for (const middleNote of middleEvent.notes) {
        const firstDirection = stepDirection(currentNote, middleNote);
        if (
          currentNote.metricAccent <= middleNote.metricAccent ||
          chordPitchClasses.has(middleNote.soundingPitchClass) ||
          currentNote.onsetTick + currentNote.sourceDurationTicks !== middleNote.onsetTick ||
          middleNote.sourceDurationTicks > currentNote.sourceDurationTicks ||
          firstDirection === 0
        ) {
          continue;
        }
        for (const finalNote of finalEvent.notes) {
          const secondDirection = stepDirection(middleNote, finalNote);
          if (
            middleNote.onsetTick + middleNote.sourceDurationTicks !== finalNote.onsetTick ||
            middleNote.sourceDurationTicks > finalNote.sourceDurationTicks ||
            secondDirection === 0
          ) {
            continue;
          }
          if (finalEvent !== after && chordPitchClasses.has(finalNote.soundingPitchClass)) {
            belongsToSegment += 1;
            harmonicCount += 1;
          } else if (isHarmonic(finalNote, finalEvent.notes)) {
            harmonicCount += 1;
          }
          const neighbor = samePitch(currentNote, finalNote);
          const passing = firstDirection === secondDirection;
          if (harmonicCount > 1 && belongsToSegment >= 1 && (neighbor || passing)) {
            removeMatchingNote(result, middleNote);
          }
        }
      }
    }
  }
  return result;
}

function isHarmonic(note: PaperSemiCrfEventNote, eventNotes: readonly PaperSemiCrfEventNote[]): boolean {
  let harmonicCount = 0;
  const seen = new Set<string>();
  const otherNoteCount = eventNotes.length - 1;
  for (const other of eventNotes) {
    if (other === note || samePitch(other, note)) continue;
    const key = `${other.soundingPitchClass}`;
    if (seen.has(key)) continue;
    const interval = mod12(other.soundingPitchClass - note.soundingPitchClass);
    const reverse = mod12(note.soundingPitchClass - other.soundingPitchClass);
    if ([3, 4, 7].includes(interval) || [3, 4, 7].includes(reverse)) {
      seen.add(key);
      harmonicCount += 1;
    }
    if (otherNoteCount > 2 && harmonicCount === 2) return true;
    if (harmonicCount === otherNoteCount) return true;
  }
  return false;
}

function stepDirection(from: PaperSemiCrfEventNote, to: PaperSemiCrfEventNote): -1 | 0 | 1 {
  const fromMidi = from.soundingMidi;
  const toMidi = to.soundingMidi;
  if (fromMidi === undefined || toMidi === undefined) return 0;
  const difference = toMidi - fromMidi;
  if (difference >= 1 && difference <= 3) return 1;
  if (difference <= -1 && difference >= -3) return -1;
  return 0;
}

function samePitch(left: PaperSemiCrfEventNote, right: PaperSemiCrfEventNote): boolean {
  if (left.soundingMidi !== undefined && right.soundingMidi !== undefined) {
    if (left.soundingMidi !== right.soundingMidi) return false;
    if (left.spelling && right.spelling) {
      return left.spelling.step === right.spelling.step && left.spelling.alter === right.spelling.alter;
    }
    return true;
  }
  return left.soundingPitchClass === right.soundingPitchClass;
}

function removeMatchingNote(notes: PaperSemiCrfEventNote[], target: PaperSemiCrfEventNote): void {
  const index = notes.findIndex(
    (note) =>
      note === target ||
      (note.id === target.id &&
        note.onsetTick === target.onsetTick &&
        note.sourceDurationTicks === target.sourceDurationTicks),
  );
  if (index >= 0) notes.splice(index, 1);
}

function lowestNote(notes: readonly PaperSemiCrfEventNote[]): PaperSemiCrfEventNote | undefined {
  return notes.reduce<PaperSemiCrfEventNote | undefined>((bass, note) => {
    if (!bass) return note;
    if (note.soundingMidi !== undefined && bass.soundingMidi !== undefined) {
      return note.soundingMidi < bass.soundingMidi ? note : bass;
    }
    if (note.soundingMidi !== undefined) return note;
    if (bass.soundingMidi !== undefined) return bass;
    return note.soundingPitchClass < bass.soundingPitchClass ? note : bass;
  }, undefined);
}

function chordRoles(label: PaperSemiCrfSupportedLabel): ChordRoles {
  const match = /^([A-G](?:bb|##|b|#)?):(maj|min|dim|aug)(4|6|7)?$/.exec(label.normalizedLabel);
  if (!match) throw new Error("unsupported paper semi-CRF feature label");
  const mode = match[2]!;
  const extension = match[3] ?? "";
  const root = pitchClass(label.chord.root.step, label.chord.root.alter);
  const third = mod12(root + (mode === "min" || mode === "dim" ? 3 : 4));
  // The reference falls through to a major-triad fifth for aug labels.
  const fifth = mod12(root + (mode === "dim" ? 6 : 7));
  const added =
    extension === "4"
      ? [mod12(root + 5)]
      : extension === "6"
        ? mode === "min"
          ? [mod12(root + 9), mod12(root + 8)]
          : [mod12(root + 9)]
        : extension === "7"
          ? mode === "dim"
            ? [mod12(root + 10), mod12(root + 9)]
            : [mod12(root + 11), mod12(root + 10)]
          : [];
  return { root: [root], third: [third], fifth: [fifth], added };
}

function paperModeAndAddedNote(label: PaperSemiCrfSupportedLabel): string {
  const match = /^[A-G](?:bb|##|b|#)?:(maj|min|dim|aug)(4|6|7)?$/.exec(label.normalizedLabel);
  if (!match) throw new Error("unsupported paper semi-CRF transition label");
  return `${match[1]}${match[2] ?? ""}`;
}

function pitchClass(step: string, alter: number): number {
  const natural: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  return mod12(natural[step]! + alter);
}

function formatReferenceDouble(value: number): string {
  return Number.isInteger(value) ? value.toFixed(1) : String(value);
}

function mod12(value: number): number {
  return ((value % 12) + 12) % 12;
}
