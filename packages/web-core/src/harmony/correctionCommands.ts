import { insertCorrection, normalizeCorrections } from "./corrections";
import type { HarmonyCorrection, ScoreWrittenRange } from "./schemas";
import type { ScoreWrittenMoment } from "./writtenTime";
import { compareMoments } from "./schemas";

export type HarmonyCorrectionCommand =
  | { type: "split"; id: string; at: ScoreWrittenMoment }
  | { type: "reset"; range: ScoreWrittenRange }
  | { type: "move"; id: string; start: ScoreWrittenMoment; end: ScoreWrittenMoment };

export function applyCorrectionCommand(
  corrections: readonly HarmonyCorrection[],
  command: HarmonyCorrectionCommand,
): HarmonyCorrection[] {
  if (command.type === "reset") return normalizeCorrections(corrections, command.range);
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
