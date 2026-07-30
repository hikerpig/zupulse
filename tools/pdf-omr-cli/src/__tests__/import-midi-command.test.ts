import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runPdfOmrCommand } from "../command";
import { midiFile, midiTrack, noteOff, noteOn, tempo } from "./fixtures/midi-builder";

describe("import-midi command", () => {
  it("writes immutable source, raw events, performance evidence, diagnostics, and a run manifest", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pdf-omr-midi-import-"));
    const inputPath = join(directory, "score.mid");
    const outputPath = join(directory, "run");
    const bytes = midiFile({
      tracks: [midiTrack(tempo(0, 500_000), noteOn(0, 0, 60, 96), noteOff(480, 0, 60))],
    });
    await writeFile(inputPath, bytes);

    const report = await runPdfOmrCommand(["import-midi", inputPath, "--output", outputPath]);

    expect(report).toMatchObject({
      command: "import-midi",
      status: "succeeded",
      inputSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      rawMidiSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      performanceEvidenceSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(await readFile(join(outputPath, "input/midi.mid"))).toEqual(Buffer.from(bytes));
    const manifest = JSON.parse(await readFile(join(outputPath, "run.json"), "utf8")) as {
      command: string;
      status: string;
      importer: { parser: { name: string; version: string } };
      artifactSha256: Record<string, string>;
    };
    expect(manifest).toMatchObject({
      command: "import-midi",
      status: "succeeded",
      importer: { parser: { name: "midi-file", version: "1.2.4" } },
    });
    expect(Object.keys(manifest.artifactSha256).sort()).toEqual([
      "diagnostics.json",
      "input.json",
      "input/midi.mid",
      "performance-evidence.json",
      "raw-midi.json",
    ]);
    const evidence = JSON.parse(await readFile(join(outputPath, "performance-evidence.json"), "utf8")) as {
      notes: unknown[];
    };
    expect(evidence.notes).toHaveLength(1);
  });

  it("produces identical evidence hashes for repeated imports", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pdf-omr-midi-repeat-"));
    const inputPath = join(directory, "score.mid");
    await writeFile(inputPath, midiFile({ tracks: [midiTrack(noteOn(0, 0, 60, 96), noteOff(480, 0, 60))] }));

    const first = await runPdfOmrCommand(["import-midi", inputPath, "--output", join(directory, "first")]);
    const second = await runPdfOmrCommand(["import-midi", inputPath, "--output", join(directory, "second")]);

    expect(first).toMatchObject({ command: "import-midi" });
    expect(second).toMatchObject({
      command: "import-midi",
      inputSha256: "inputSha256" in first ? first.inputSha256 : "",
      rawMidiSha256: "rawMidiSha256" in first ? first.rawMidiSha256 : "",
      performanceEvidenceSha256: "performanceEvidenceSha256" in first ? first.performanceEvidenceSha256 : "",
    });
    for (const artifact of [
      "input/midi.mid",
      "input.json",
      "raw-midi.json",
      "performance-evidence.json",
      "diagnostics.json",
    ]) {
      expect(await readFile(join(directory, "first", artifact))).toEqual(
        await readFile(join(directory, "second", artifact)),
      );
    }
  });

  it("rejects unreadable and malformed inputs before creating an output directory", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pdf-omr-midi-invalid-"));
    const missingOutput = join(directory, "missing-run");
    await expect(
      runPdfOmrCommand(["import-midi", join(directory, "missing.mid"), "--output", missingOutput]),
    ).rejects.toMatchObject({
      code: "INVALID_INPUT",
      context: expect.objectContaining({ reason: "unreadable-midi" }),
    });
    await expect(access(missingOutput)).rejects.toBeDefined();

    const malformedPath = join(directory, "malformed.mid");
    const malformedOutput = join(directory, "malformed-run");
    await writeFile(malformedPath, new Uint8Array([1, 2, 3]));
    await expect(runPdfOmrCommand(["import-midi", malformedPath, "--output", malformedOutput])).rejects.toMatchObject({
      code: "INVALID_INPUT",
      context: expect.objectContaining({ reason: "invalid-midi-header" }),
    });
    await expect(access(malformedOutput)).rejects.toBeDefined();
  });

  it("rejects invalid arguments and existing output directories", async () => {
    await expect(runPdfOmrCommand(["import-midi"])).rejects.toMatchObject({
      code: "INVALID_CLI_ARGUMENT",
      context: { command: "import-midi" },
    });

    const directory = await mkdtemp(join(tmpdir(), "pdf-omr-midi-existing-"));
    const inputPath = join(directory, "score.mid");
    await writeFile(inputPath, midiFile({ tracks: [midiTrack()] }));
    await expect(runPdfOmrCommand(["import-midi", inputPath, "--output", directory])).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
  });

  it("imports the reviewed K331 score-exported MIDI against its locked provenance", async () => {
    const midiPath = fileURLToPath(new URL("../../../../test-fixtures/musicxml/K331-3_reviewed.mid", import.meta.url));
    const provenancePath = fileURLToPath(
      new URL("../../../../test-fixtures/musicxml/K331-3_reviewed.provenance.json", import.meta.url),
    );
    const provenance = JSON.parse(await readFile(provenancePath, "utf8")) as {
      derivedArtifacts: Array<{ role: string; sha256: string; facts?: { parsedNoteCount?: number } }>;
    };
    const midiProvenance = provenance.derivedArtifacts.find((artifact) => artifact.role === "score-exported-midi");
    const directory = await mkdtemp(join(tmpdir(), "pdf-omr-k331-midi-"));
    const outputPath = join(directory, "run");

    const report = await runPdfOmrCommand(["import-midi", midiPath, "--output", outputPath]);
    const evidence = JSON.parse(await readFile(join(outputPath, "performance-evidence.json"), "utf8")) as {
      source: { trackCount: number; ticksPerQuarter: number };
      notes: unknown[];
    };

    expect(report).toMatchObject({
      command: "import-midi",
      inputSha256: midiProvenance?.sha256,
    });
    expect(evidence.source).toMatchObject({ trackCount: 2, ticksPerQuarter: 480 });
    expect(evidence.notes).toHaveLength(midiProvenance?.facts?.parsedNoteCount ?? -1);
  });
});
