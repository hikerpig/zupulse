import { insertCorrection, normalizeCorrections } from "./corrections";
import type { HarmonyCorrection, ScoreWrittenRange } from "./schemas";
import type { ScoreWrittenMoment } from "./writtenTime";
import { compareMoments } from "./schemas";

export type HarmonyCorrectionCommand =
  | { type: "split"; id: string; at: ScoreWrittenMoment }
  | { type: "reset"; range: ScoreWrittenRange }
  | { type: "merge"; leftId: string; rightId: string }
  | { type: "move"; id: string; start: ScoreWrittenMoment; end: ScoreWrittenMoment };

export function applyCorrectionCommand(
  corrections: readonly HarmonyCorrection[],
  command: HarmonyCorrectionCommand,
): HarmonyCorrection[] {
  if (command.type === "reset") return normalizeCorrections(corrections, command.range);
  if (command.type === "merge") return mergeCorrections(corrections, command.leftId, command.rightId);
  const current = corrections.find((item) => item.id === command.id);
  if (!current) return [...corrections];
  if (
    command.type === "split" &&
    compareMoments(current.range.start, command.at) < 0 &&
    compareMoments(command.at, current.range.end) < 0
  ) {
    const remaining = corrections.filter((item) => item.id !== command.id);
    return insertCorrection(
      insertCorrection(remaining, { ...current, range: { start: current.range.start, end: command.at } }),
      { ...current, id: `${current.id}:split`, range: { start: command.at, end: current.range.end } },
    );
  }
  if (command.type === "move")
    return insertCorrection(
      corrections.filter((item) => item.id !== command.id),
      { ...current, range: { start: command.start, end: command.end } },
    );
  return [...corrections];
}

function mergeCorrections(
  corrections: readonly HarmonyCorrection[],
  leftId: string,
  rightId: string,
): HarmonyCorrection[] {
  const left = corrections.find((item) => item.id === leftId);
  const right = corrections.find((item) => item.id === rightId);
  if (!left || !right || left.id === right.id) return [...corrections];
  if (compareMoments(left.range.end, right.range.start) !== 0) return [...corrections];
  if (JSON.stringify(left.value) !== JSON.stringify(right.value)) return [...corrections];
  return insertCorrection(
    corrections.filter((item) => item.id !== leftId && item.id !== rightId),
    { ...left, range: { start: left.range.start, end: right.range.end } },
  );
}
