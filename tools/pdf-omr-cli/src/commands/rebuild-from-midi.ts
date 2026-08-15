import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join, resolve } from "node:path";
import { createMusicXmlAdapter } from "@zupulse/web-core";
import { createArtifactWriter } from "../artifact-writer";
import { sha256Bytes } from "../canonical-json";
import { runEngineProcess } from "../engine-runner";
import { PdfOmrError } from "../errors";
import { alignScorePerformance } from "../fusion/align-score-performance";
import { assessFusionCompatibility } from "../fusion/assess-compatibility";
import { buildScoreEvidence } from "../fusion/build-score-evidence";
import { midiRebuildReportSchema, type MidiRebuildReport } from "../fusion/midi-rebuild-schemas";
import { buildPerformanceEvidence } from "../midi/build-performance-evidence";
import { parseStandardMidi } from "../midi/parse-standard-midi";
import { normalizeAudiverisMusicXml } from "../normalizers/audiveris";
import { validateDraft } from "../validate-draft";

type RebuildFromMidiOptions = {
  musicXml: string;
  midi: string;
  museScore: string;
  output: string;
  cwd: string;
  signal?: AbortSignal;
};

export async function rebuildFromMidiCommand(options: RebuildFromMidiOptions): Promise<MidiRebuildReport> {
  const outputDirectory = resolve(options.cwd, options.output);
  await ensureOutputAbsent(outputDirectory);
  const scorePath = resolve(options.cwd, options.musicXml);
  const midiPath = resolve(options.cwd, options.midi);
  const [sourceBytes, midiBytes] = await Promise.all([
    readInput(scorePath, "unreadable-musicxml"),
    readInput(midiPath, "unreadable-midi"),
  ]);
  const sourceAnalysis = analyze(sourceBytes, midiBytes, basename(options.musicXml));
  if (sourceAnalysis.compatibility.status !== "compatible") fail("source-midi-incompatible");

  const temporaryDirectory = await mkdtemp(join(tmpdir(), "pdf-omr-midi-rebuild-"));
  const rebuiltPath = join(temporaryDirectory, "score.musicxml");
  try {
    const version = await runEngineProcess({ command: options.museScore, args: ["--version"] }, options.signal);
    const museScoreVersion = version.stdout.trim();
    if (museScoreVersion.length === 0) fail("musescore-version-empty");
    await runEngineProcess({ command: options.museScore, args: ["-f", "-o", rebuiltPath, midiPath] }, options.signal);
    const rebuiltBytes = await readInput(rebuiltPath, "missing-rebuilt-musicxml");
    const rebuiltDraft = normalizeAudiverisMusicXml(rebuiltBytes);
    const draftValidation = validateDraft(rebuiltDraft);
    if (draftValidation.readiness.harmony === "blocked" || draftValidation.readiness.musicXml === "blocked") {
      fail("rebuilt-draft-invalid");
    }
    const adapter = await createMusicXmlAdapter().parse({ fileName: "score.musicxml", bytes: rebuiltBytes });
    if (!adapter.capabilities.view || !adapter.capabilities.playback) fail("rebuilt-score-unusable");
    const rebuiltAnalysis = analyze(rebuiltBytes, midiBytes, "score.musicxml");
    if (!isExactRebuild(rebuiltAnalysis)) fail("rebuilt-midi-mismatch");

    const correctedScoreSha256 = sha256Bytes(rebuiltBytes);
    const measureCount = Math.max(
      0,
      ...rebuiltDraft.parts.flatMap((part) => part.staves.map((staff) => staff.measures.length)),
    );
    const noteCount = rebuiltAnalysis.score.notes.length;
    const writer = await createArtifactWriter(outputDirectory);
    await writer.writeBytes(`input/source${scoreExtension(options.musicXml)}`, sourceBytes);
    await writer.writeBytes("input/midi.mid", midiBytes);
    await writer.writeBytes("corrected/score.musicxml", rebuiltBytes);
    await writer.writeJson("validation.json", {
      draft: draftValidation,
      runtime: { parse: true, view: adapter.capabilities.view, playback: adapter.capabilities.playback },
      sourceFusion: {
        compatibility: sourceAnalysis.compatibility,
        summary: sourceAnalysis.alignment.summary,
      },
      rebuiltFusion: {
        compatibility: rebuiltAnalysis.compatibility,
        summary: rebuiltAnalysis.alignment.summary,
      },
    });
    const runId = `${sha256Bytes(new TextEncoder().encode(`${sha256Bytes(sourceBytes)}:${sha256Bytes(midiBytes)}`)).slice(0, 16)}-midi-rebuild`;
    await writer.writeJson("run.json", {
      schemaVersion: "1.0.0",
      runId,
      command: "rebuild-from-midi",
      status: "succeeded",
      museScoreVersion,
      inputSha256: { score: sha256Bytes(sourceBytes), midi: sha256Bytes(midiBytes) },
      correctedScore: { artifactPath: "corrected/score.musicxml", sha256: correctedScoreSha256 },
      measureCount,
      noteCount,
      artifactSha256: writer.artifactSha256(),
    });
    return midiRebuildReportSchema.parse({
      schemaVersion: "1.0.0",
      command: "rebuild-from-midi",
      status: "succeeded",
      runId,
      museScoreVersion,
      measureCount,
      noteCount,
      correctedScoreSha256,
    });
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function ensureOutputAbsent(outputDirectory: string): Promise<void> {
  try {
    await access(outputDirectory);
    fail("output-directory-exists");
  } catch (error) {
    if (error instanceof PdfOmrError) throw error;
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

function scoreExtension(path: string): string {
  const extension = extname(path).toLowerCase();
  return extension === ".mxl" || extension === ".xml" || extension === ".musicxml" ? extension : ".musicxml";
}

function analyze(scoreBytes: Uint8Array, midiBytes: Uint8Array, fileName: string) {
  const score = buildScoreEvidence(normalizeAudiverisMusicXml(scoreBytes), {
    fileName,
    sha256: sha256Bytes(scoreBytes),
    sizeBytes: scoreBytes.length,
  });
  const performance = buildPerformanceEvidence(parseStandardMidi(midiBytes), {
    fileName: "score.mid",
    sha256: sha256Bytes(midiBytes),
    sizeBytes: midiBytes.length,
  });
  const compatibility = assessFusionCompatibility(score, performance);
  const result = alignScorePerformance(score, performance, compatibility);
  return { score, performance, compatibility, alignment: result.alignment };
}

function isExactRebuild(analysis: ReturnType<typeof analyze>): boolean {
  const summary = analysis.alignment.summary;
  return (
    analysis.compatibility.status === "compatible" &&
    summary.ambiguous === 0 &&
    summary.scoreOnly === 0 &&
    summary.midiOnly === 0 &&
    summary.scoreCoverage === 1 &&
    summary.midiCoverage === 1 &&
    summary.pitchAgreement === 1
  );
}

async function readInput(path: string, reason: string): Promise<Uint8Array> {
  try {
    return await readFile(path);
  } catch (error) {
    throw new PdfOmrError("INVALID_INPUT", "MIDI score rebuild input cannot be read", {
      context: { reason },
      cause: error,
    });
  }
}

function fail(reason: string): never {
  throw new PdfOmrError("INVALID_INPUT", "MIDI score rebuild failed", { context: { reason } });
}
