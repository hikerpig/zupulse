import { insertMusicXmlHarmony, type MusicXmlHarmonyInsertion } from "./musicXmlRoundTrip";
import { formatChordSymbol } from "./formatter";
import { chordSymbolSchema } from "./schemas";

export type AnnotatedHarmonyInsertion = Omit<MusicXmlHarmonyInsertion, "harmonyXml"> & { chord: unknown };

export function exportAnnotatedMusicXml(
  bytes: Uint8Array,
  insertions: readonly AnnotatedHarmonyInsertion[],
): Uint8Array {
  return insertMusicXmlHarmony(
    bytes,
    insertions.map((insertion) => ({ ...insertion, harmonyXml: chordToMusicXml(insertion.chord) })),
  );
}

export function chordToMusicXml(input: unknown): string {
  const chord = chordSymbolSchema.parse(input);
  const kind =
    chord.kind === "suspended-second" ? "suspended-2" : chord.kind === "suspended-fourth" ? "suspended-4" : chord.kind;
  const extension =
    chord.extension === undefined
      ? ""
      : `<degree><degree-value>${chord.extension}</degree-value><degree-alter>0</degree-alter><degree-type>add</degree-type></degree>`;
  const degrees = chord.degrees
    .map(
      (degree) =>
        `<degree><degree-value>${degree.value}</degree-value><degree-alter>${degree.alter}</degree-alter><degree-type>${degree.operation}</degree-type></degree>`,
    )
    .join("");
  const bass = chord.bass
    ? `<bass><bass-step>${chord.bass.step}</bass-step>${chord.bass.alter === 0 ? "" : `<bass-alter>${chord.bass.alter}</bass-alter>`}</bass>`
    : "";
  return `<harmony><root><root-step>${chord.root.step}</root-step>${chord.root.alter === 0 ? "" : `<root-alter>${chord.root.alter}</root-alter>`}</root><kind>${kind}</kind>${extension}${degrees}${bass}</harmony>`;
}
