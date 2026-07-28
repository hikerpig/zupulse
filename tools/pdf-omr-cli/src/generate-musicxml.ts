import { zipSync } from "fflate";
import { PdfOmrError } from "./errors";
import { escapeXmlAttribute, escapeXmlText, musicXmlDivisions, musicXmlDuration } from "./musicxml-subset";
import { compareRational } from "./rational";
import type { OmrScoreDraft } from "./schemas";
import { validateDraft } from "./validate-draft";

export function generateMusicXml(draft: OmrScoreDraft, options: { container: "xml" | "mxl" }): Uint8Array {
  const validation = validateDraft(draft);
  if (validation.readiness.musicXml === "blocked") {
    throw new PdfOmrError("PROJECTION_OR_EXPORT_FAILED", "Draft is not MusicXML-ready", {
      context: { reason: "musicxml-readiness-blocked" },
    });
  }
  try {
    const xmlBytes = new TextEncoder().encode(renderScore(draft));
    if (options.container === "xml") return xmlBytes;
    return zipSync(
      {
        "META-INF/container.xml": new TextEncoder().encode(
          '<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="score.musicxml" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>',
        ),
        "score.musicxml": xmlBytes,
      },
      { level: 6 },
    );
  } catch (error) {
    if (error instanceof PdfOmrError) throw error;
    throw new PdfOmrError("PROJECTION_OR_EXPORT_FAILED", "Draft cannot be represented by the MusicXML subset", {
      context: { reason: "unsupported-musicxml-fact" },
      cause: error,
    });
  }
}

function renderScore(draft: OmrScoreDraft): string {
  const partList = draft.parts
    .map(
      (part) =>
        `<score-part id="${escapeXmlAttribute(part.id)}"><part-name>${escapeXmlText(part.name)}</part-name></score-part>`,
    )
    .join("");
  const parts = draft.parts.map(renderPart).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<score-partwise version="4.0"><part-list>${partList}</part-list>${parts}</score-partwise>`;
}

function renderPart(part: OmrScoreDraft["parts"][number]): string {
  const measureCount = part.staves[0]?.measures.length ?? 0;
  const measures = Array.from({ length: measureCount }, (_, measureIndex) => renderMeasure(part, measureIndex)).join(
    "",
  );
  return `<part id="${escapeXmlAttribute(part.id)}">${measures}</part>`;
}

function renderMeasure(part: OmrScoreDraft["parts"][number], measureIndex: number): string {
  const staffMeasures = part.staves.map((staff) => staff.measures[measureIndex]!);
  const reference = staffMeasures[0]!;
  if (
    reference.timeSignature === undefined ||
    reference.duration === undefined ||
    reference.keySignature === undefined
  ) {
    throw new Error("missing-measure-facts");
  }
  const rationalValues = staffMeasures.flatMap((measure) => [
    ...(measure.duration === undefined ? [] : [measure.duration]),
    ...measure.voices.flatMap((voice) => voice.events.flatMap((event) => [event.onset, event.duration])),
  ]);
  const divisions = musicXmlDivisions(rationalValues);
  const clefs = staffMeasures
    .map((measure, staffIndex) => {
      if (measure.clef === undefined) throw new Error("missing-clef");
      return `<clef${part.staves.length > 1 ? ` number="${staffIndex + 1}"` : ""}><sign>${measure.clef.sign}</sign>${
        measure.clef.line === undefined ? "" : `<line>${measure.clef.line}</line>`
      }</clef>`;
    })
    .join("");
  const attributes = `<attributes><divisions>${divisions}</divisions><key><fifths>${
    reference.keySignature.fifths
  }</fifths></key><time><beats>${reference.timeSignature.numerator}</beats><beat-type>${
    reference.timeSignature.denominator
  }</beat-type></time>${part.staves.length > 1 ? `<staves>${part.staves.length}</staves>` : ""}${clefs}</attributes>`;
  const forwardRepeat = reference.repeat?.forward
    ? '<barline location="left"><repeat direction="forward"/></barline>'
    : "";
  const backwardRepeat = reference.repeat?.backward
    ? '<barline location="right"><repeat direction="backward"/></barline>'
    : "";
  const streams: string[] = [];
  let hasPreviousStream = false;
  const measureUnits = musicXmlDuration(reference.duration, divisions);
  for (const [staffIndex, measure] of staffMeasures.entries()) {
    for (const voice of measure.voices) {
      if (hasPreviousStream) streams.push(`<backup><duration>${measureUnits}</duration></backup>`);
      streams.push(renderVoice(voice, staffIndex, divisions));
      hasPreviousStream = true;
    }
  }
  return `<measure number="${measureIndex + 1}">${attributes}${forwardRepeat}${streams.join("")}${backwardRepeat}</measure>`;
}

function renderVoice(
  voice: OmrScoreDraft["parts"][number]["staves"][number]["measures"][number]["voices"][number],
  staffIndex: number,
  divisions: number,
): string {
  const events = [...voice.events].sort(
    (left, right) => compareRational(left.onset, right.onset) || left.id.localeCompare(right.id),
  );
  let cursor = 0;
  let groupOnset = -1;
  let groupEnd = 0;
  const result: string[] = [];
  for (const event of events) {
    const onset = musicXmlDuration(event.onset, divisions);
    const duration = musicXmlDuration(event.duration, divisions);
    const chord = onset === groupOnset;
    if (!chord) {
      if (onset > cursor) result.push(`<forward><duration>${onset - cursor}</duration></forward>`);
      cursor = onset;
      groupOnset = onset;
      groupEnd = onset + duration;
    } else {
      groupEnd = Math.max(groupEnd, onset + duration);
    }
    result.push(renderEvent(event, voice.index, staffIndex, duration, chord));
    if (!chord) cursor = groupEnd;
  }
  return result.join("");
}

function renderEvent(
  event: OmrScoreDraft["parts"][number]["staves"][number]["measures"][number]["voices"][number]["events"][number],
  voice: number,
  staffIndex: number,
  duration: number,
  chord: boolean,
): string {
  const prefix = chord ? "<chord/>" : "";
  const staff = `<staff>${staffIndex + 1}</staff>`;
  if (event.type === "rest") {
    return `<note>${prefix}<rest/><duration>${duration}</duration><voice>${voice}</voice>${staff}</note>`;
  }
  if (event.writtenPitch === undefined) throw new Error("written-pitch-required");
  const pitch = `<pitch><step>${event.writtenPitch.step}</step>${
    event.writtenPitch.alter === 0 ? "" : `<alter>${event.writtenPitch.alter}</alter>`
  }<octave>${event.writtenPitch.octave}</octave></pitch>`;
  const tieTypes =
    event.tie === "continue"
      ? ["stop", "start"]
      : event.tie === "end"
        ? ["stop"]
        : event.tie === "start"
          ? ["start"]
          : [];
  const ties = tieTypes.map((type) => `<tie type="${type}"/>`).join("");
  const timeModification =
    event.tuplet === undefined
      ? ""
      : `<time-modification><actual-notes>${event.tuplet.actualNotes}</actual-notes><normal-notes>${event.tuplet.normalNotes}</normal-notes></time-modification>`;
  const notations =
    tieTypes.length === 0 ? "" : `<notations>${tieTypes.map((type) => `<tied type="${type}"/>`).join("")}</notations>`;
  return `<note>${prefix}${pitch}<duration>${duration}</duration>${ties}<voice>${voice}</voice>${staff}${timeModification}${notations}</note>`;
}
