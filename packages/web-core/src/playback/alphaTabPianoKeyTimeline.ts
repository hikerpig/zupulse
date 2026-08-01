import * as alphaTab from "@coderline/alphatab";
import type { PianoHandMapping } from "./types";
import { cloneAlphaTabScoreForStaffProjection } from "./alphaTabStaffAudioProjection";

export type PianoKeyHintEvent = {
  pitch: number;
  startTick: number;
  endTick: number;
  hand: "right" | "left";
};

type RecordedNote = {
  key: number;
  startTick: number;
  endTick: number;
  channel: number;
};

export function buildAlphaTabPianoKeyTimeline(
  sourceScore: alphaTab.model.Score,
  settings: alphaTab.Settings,
  mapping: PianoHandMapping,
): PianoKeyHintEvent[] {
  return (
    [
      ["right", mapping.rightStaffId],
      ["left", mapping.leftStaffId],
    ] as const
  )
    .flatMap(([hand, staffId]) => projectHand(sourceScore, settings, staffId, hand))
    .sort(compareHintEvents);
}

function projectHand(
  sourceScore: alphaTab.model.Score,
  settings: alphaTab.Settings,
  staffId: string,
  hand: PianoKeyHintEvent["hand"],
): PianoKeyHintEvent[] {
  const score = cloneAlphaTabScoreForStaffProjection(sourceScore, settings, new Set([staffId]));
  const handler = new PianoKeyTimelineHandler();
  const generator = new alphaTab.midi.MidiFileGenerator(score, settings, handler);
  generator.applyTranspositionPitches = false;
  generator.generate();

  return handler.notes.flatMap((note) => {
    if (!Number.isFinite(note.startTick) || !Number.isFinite(note.endTick) || note.endTick <= note.startTick) return [];
    const pitch = Math.round(note.key + (generator.transpositionPitches.get(note.channel) ?? 0));
    if (pitch < 0 || pitch > 127) return [];
    return [{ pitch, startTick: note.startTick, endTick: note.endTick, hand }];
  });
}

function compareHintEvents(left: PianoKeyHintEvent, right: PianoKeyHintEvent): number {
  return (
    left.startTick - right.startTick ||
    left.endTick - right.endTick ||
    left.pitch - right.pitch ||
    left.hand.localeCompare(right.hand)
  );
}

class PianoKeyTimelineHandler implements alphaTab.midi.IMidiFileHandler {
  readonly notes: RecordedNote[] = [];

  addNote(_track: number, start: number, length: number, key: number, _velocity: number, channel: number): void {
    this.notes.push({ key, startTick: start, endTick: start + length, channel });
  }

  addTimeSignature(_tick: number, _numerator: number, _denominator: number): void {}
  addRest(_track: number, _tick: number, _channel: number): void {}
  addControlChange(
    _track: number,
    _tick: number,
    _channel: number,
    _controller: alphaTab.midi.ControllerType,
    _value: number,
  ): void {}
  addProgramChange(_track: number, _tick: number, _channel: number, _program: number): void {}
  addTempo(_tick: number, _tempo: number): void {}
  addNoteBend(_track: number, _tick: number, _channel: number, _key: number, _value: number): void {}
  addBend(_track: number, _tick: number, _channel: number, _value: number): void {}
  finishTrack(_track: number, _tick: number): void {}
  addTickShift(_tickShift: number): void {}
}
