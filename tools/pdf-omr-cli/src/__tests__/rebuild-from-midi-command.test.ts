import { access, chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runPdfOmrCommand } from "../command";
import { midiFile, midiTrack, noteOff, noteOn, tempo, timeSignature } from "./fixtures/midi-builder";

const museScore = fileURLToPath(new URL("fixtures/fake-musescore.mjs", import.meta.url));

describe("rebuild-from-midi command", () => {
  it("rebuilds invalid score timing from compatible score-export MIDI", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pdf-omr-midi-rebuild-"));
    const sourcePath = join(directory, "source.musicxml");
    const midiPath = join(directory, "score.mid");
    const rebuiltFixturePath = join(directory, "musescore-output.musicxml");
    const output = join(directory, "output");
    await chmod(museScore, 0o755);
    await Promise.all([
      writeFile(sourcePath, scoreMusicXml(1)),
      writeFile(rebuiltFixturePath, scoreMusicXml(3)),
      writeFile(midiPath, scoreMidi()),
    ]);

    const report = await runPdfOmrCommand([
      "rebuild-from-midi",
      "--musicxml",
      sourcePath,
      "--midi",
      midiPath,
      "--musescore",
      museScore,
      "--output",
      output,
    ]);

    expect(report).toMatchObject({
      command: "rebuild-from-midi",
      status: "succeeded",
      museScoreVersion: "MuseScore 4.6.2",
      measureCount: 1,
      noteCount: 2,
    });
    expect(await readFile(join(output, "corrected/score.musicxml"), "utf8")).toContain("<duration>3</duration>");
    await expect(readFile(sourcePath, "utf8")).resolves.toContain("<duration>1</duration>");
  });

  it("does not publish a rebuilt score whose voices still have invalid durations", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pdf-omr-midi-rebuild-invalid-"));
    const sourcePath = join(directory, "source.musicxml");
    const midiPath = join(directory, "score.mid");
    const output = join(directory, "output");
    await chmod(museScore, 0o755);
    await Promise.all([
      writeFile(sourcePath, scoreMusicXml(3)),
      writeFile(join(directory, "musescore-output.musicxml"), scoreMusicXml(1)),
      writeFile(midiPath, scoreMidi()),
    ]);

    await expect(
      runPdfOmrCommand([
        "rebuild-from-midi",
        "--musicxml",
        sourcePath,
        "--midi",
        midiPath,
        "--musescore",
        museScore,
        "--output",
        output,
      ]),
    ).rejects.toMatchObject({ context: { reason: "rebuilt-draft-invalid" } });
    await expect(access(output)).rejects.toBeDefined();
  });
});

function scoreMidi(): Uint8Array {
  return midiFile({
    tracks: [
      midiTrack(
        tempo(0, 500_000),
        timeSignature(0, 6, 3),
        noteOn(0, 0, 60, 96),
        noteOff(720, 0, 60),
        noteOn(0, 0, 67, 96),
        noteOff(720, 0, 67),
      ),
    ],
  });
}

function scoreMusicXml(duration: number): string {
  const note = (step: string, octave: number) =>
    `<note><pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>${duration}</duration><voice>1</voice><staff>1</staff></note>`;
  return `<?xml version="1.0"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>2</divisions><key><fifths>0</fifths></key><time><beats>6</beats><beat-type>8</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>${note("C", 4)}${note("G", 4)}</measure></part></score-partwise>`;
}
