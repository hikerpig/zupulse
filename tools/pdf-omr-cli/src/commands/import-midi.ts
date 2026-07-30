import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { createArtifactWriter } from "../artifact-writer";
import { sha256Bytes } from "../canonical-json";
import { PdfOmrError } from "../errors";
import { buildPerformanceEvidence } from "../midi/build-performance-evidence";
import { DEFAULT_MIDI_IMPORT_LIMITS, parseStandardMidi } from "../midi/parse-standard-midi";
import {
  midiImportInputReportSchema,
  midiImportReportSchema,
  midiImportRunManifestSchema,
  type MidiImportReport,
} from "../midi/schemas";

export async function importMidiCommand(input: string, output: string, cwd: string): Promise<MidiImportReport> {
  const inputPath = resolve(cwd, input);
  let bytes: Uint8Array;
  try {
    bytes = await readFile(inputPath);
  } catch (error) {
    throw new PdfOmrError("INVALID_INPUT", "input MIDI cannot be read", {
      context: { reason: "unreadable-midi", fileName: basename(input) },
      cause: error,
    });
  }

  const startedAt = new Date().toISOString();
  const inputSha256 = sha256Bytes(bytes);
  const rawMidi = parseStandardMidi(bytes);
  const inputReport = midiImportInputReportSchema.parse({
    schemaVersion: "1.0.0",
    fileName: basename(input),
    sha256: inputSha256,
    sizeBytes: bytes.length,
    smfFormat: rawMidi.header.format,
    trackCount: rawMidi.header.trackCount,
    ticksPerQuarter: rawMidi.header.ticksPerQuarter,
  });
  const performanceEvidence = buildPerformanceEvidence(rawMidi, {
    fileName: inputReport.fileName,
    sha256: inputReport.sha256,
    sizeBytes: inputReport.sizeBytes,
  });
  const writer = await createArtifactWriter(resolve(cwd, output));
  const runId = `${inputSha256.slice(0, 16)}-midi-import`;

  await writer.writeBytes("input/midi.mid", bytes);
  await writer.writeJson("input.json", inputReport);
  const rawMidiSha256 = await writer.writeJson("raw-midi.json", rawMidi);
  const performanceEvidenceSha256 = await writer.writeJson("performance-evidence.json", performanceEvidence);
  await writer.writeJson("diagnostics.json", performanceEvidence.diagnostics);
  const manifest = midiImportRunManifestSchema.parse({
    schemaVersion: "1.0.0",
    runId,
    command: "import-midi",
    inputSha256,
    importer: {
      id: "zupulse-midi-import",
      version: "1.0.0",
      parser: { name: "midi-file", version: "1.2.4" },
    },
    limits: DEFAULT_MIDI_IMPORT_LIMITS,
    startedAt,
    completedAt: new Date().toISOString(),
    status: "succeeded",
    artifactSha256: writer.artifactSha256(),
  });
  await writer.writeJson("run.json", manifest);

  return midiImportReportSchema.parse({
    schemaVersion: "1.0.0",
    command: "import-midi",
    status: "succeeded",
    runId,
    inputSha256,
    rawMidiSha256,
    performanceEvidenceSha256,
  });
}
