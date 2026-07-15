import type { ChordSymbolInput } from "./schemas";

const alterText = (alter: number): string =>
  alter === -2 ? "bb" : alter === -1 ? "b" : alter === 1 ? "#" : alter === 2 ? "##" : "";
const kindText: Record<ChordSymbolInput["kind"], string> = {
  major: "",
  minor: "m",
  dominant: "",
  diminished: "dim",
  "half-diminished": "ø",
  augmented: "+",
  "suspended-second": "sus2",
  "suspended-fourth": "sus4",
  power: "5",
};

export function formatChordSymbol(chord: ChordSymbolInput): string {
  const extension = chord.kind === "dominant" ? (chord.extension ?? 7) : (chord.extension ?? "");
  const degrees = chord.degrees
    .slice()
    .sort((a, b) => a.value - b.value || a.operation.localeCompare(b.operation) || a.alter - b.alter)
    .map(
      (degree) =>
        `${degree.operation === "subtract" ? "omit" : degree.operation === "add" ? "add" : ""}${alterText(degree.alter)}${degree.value}`,
    )
    .join(",");
  const body = `${chord.root.step}${alterText(chord.root.alter)}${kindText[chord.kind]}${extension}`;
  return `${body}${degrees ? `(${degrees})` : ""}${chord.bass ? `/${chord.bass.step}${alterText(chord.bass.alter)}` : ""}`;
}
