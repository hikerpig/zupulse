import * as alphaTab from "@coderline/alphatab";

export type AlphaTabStaffAudioProjection = {
  score: alphaTab.model.Score;
  midiFile: alphaTab.midi.MidiFile;
  tickShift: number;
  syncPoints: alphaTab.synth.BackingTrackSyncPoint[];
  transpositionPitches: Map<number, number>;
};

export function buildAlphaTabStaffAudioProjection(
  sourceScore: alphaTab.model.Score,
  settings: alphaTab.Settings,
  audibleStaffIds: ReadonlySet<string>,
): AlphaTabStaffAudioProjection {
  const serialized = alphaTab.model.JsonConverter.scoreToJsObject(sourceScore);
  if (!serialized) throw new Error("Could not clone alphaTab score for staff audio projection");
  const score = alphaTab.model.JsonConverter.jsObjectToScore(serialized, settings);
  const knownStaffIds = new Set<string>();

  for (const track of score.tracks) {
    for (const staff of track.staves) {
      const staffId = `track-${track.index}:staff-${staff.index}`;
      knownStaffIds.add(staffId);
      if (audibleStaffIds.has(staffId)) continue;
      for (const bar of staff.bars) {
        for (const voice of bar.voices) {
          for (const beat of voice.beats) beat.notes = [];
        }
      }
    }
  }
  for (const staffId of audibleStaffIds) {
    if (!knownStaffIds.has(staffId)) throw new Error(`Unknown alphaTab staff projection target: ${staffId}`);
  }

  const midiFile = new alphaTab.midi.MidiFile();
  const handler = new alphaTab.midi.AlphaSynthMidiFileHandler(midiFile);
  const generator = new alphaTab.midi.MidiFileGenerator(score, settings, handler);
  generator.applyTranspositionPitches = false;
  generator.generate();
  return {
    score,
    midiFile,
    tickShift: handler.tickShift,
    syncPoints: generator.syncPoints,
    transpositionPitches: generator.transpositionPitches,
  };
}
