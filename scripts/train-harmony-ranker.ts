import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { unzipSync } from "fflate";
import { format, resolveConfig } from "prettier";
import type { HarmonyTrainingRecord } from "./harmonyRankerTraining";
import { trainHarmonyRanker } from "./harmonyRankerTraining";
import { splitHarmonyGroup } from "./harmonyDatasetSplit";
import { parseUciHarmonyLabel, pitchNameToPitch } from "./uciHarmonyLabel";
import { isPitchedMidiNote, parseCmuChordLabel, parseStandardMidi } from "./cmuCmaParser";

type Manifest = { sha256: string };

const uciPath = process.argv[2] ?? process.env.HARMONY_UCI_ZIP;
const cmuPath = process.argv[3] ?? process.env.HARMONY_CMU_ZIP;
const outputPath = process.argv[4] ?? "packages/web-core/src/harmony/harmony-ranker-model.json";
if (!uciPath || !cmuPath) throw new Error("usage: train-harmony-ranker <uci.zip> <cmu.zip> [output.json]");

const uciManifest = await readManifest("../test-fixtures/harmony/uci-bach-manifest.json");
const cmuManifest = await readManifest("../test-fixtures/harmony/cmu-cma-manifest.json");
const uciArchive = await readVerified(uciPath, uciManifest.sha256);
const cmuArchive = await readVerified(cmuPath, cmuManifest.sha256);
const records = [...readUciRecords(uciArchive), ...readCmuRecords(cmuArchive)].filter(
  (record) => splitHarmonyGroup(record.groupId) !== "eval",
);
const model = trainHarmonyRanker(records, [uciManifest.sha256, cmuManifest.sha256]);
await writeFile(
  outputPath,
  await format(JSON.stringify(model), { ...(await resolveConfig(outputPath)), filepath: outputPath }),
);
console.log(
  JSON.stringify({ outputPath, prototypes: model.prototypes.length, trainingGroupsSha256: model.trainingGroupsSha256 }),
);

async function readManifest(relativePath: string): Promise<Manifest> {
  return JSON.parse(await readFile(new URL(relativePath, import.meta.url), "utf8")) as Manifest;
}

async function readVerified(path: string, expectedSha256: string): Promise<Uint8Array> {
  const bytes = await readFile(path);
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== expectedSha256) throw new Error(`corpus checksum mismatch: ${path}`);
  return bytes;
}

function readUciRecords(archive: Uint8Array): HarmonyTrainingRecord[] {
  const data = unzipSync(archive)["jsbach_chorals_harmony.data"];
  if (!data) throw new Error("UCI data file missing");
  return new TextDecoder()
    .decode(data)
    .trim()
    .split(/\r?\n/)
    .flatMap((line) => {
      const columns = line.split(",").map((value) => value.trim());
      const expected = parseUciHarmonyLabel(columns[16] ?? "");
      if (!expected) return [];
      const durationByPitchClass = columns.slice(2, 14).map((value) => Number(value === "YES"));
      if (!durationByPitchClass.some(Boolean)) return [];
      return [
        {
          corpus: "uci-bach",
          groupId: columns[0]!,
          expected,
          features: {
            durationByPitchClass,
            onsetCountByPitchClass: durationByPitchClass,
            bassPitchClass: pitchNameToPitch(columns[14]!).pitchClass,
          },
        },
      ];
    });
}

function readCmuRecords(archive: Uint8Array): HarmonyTrainingRecord[] {
  const entries = unzipSync(archive);
  return Object.keys(entries)
    .filter((name) => /^test\/.+_chord\.txt$/.test(name))
    .sort()
    .flatMap((chordFile) => {
      const groupId = chordFile.slice("test/".length, -"_chord.txt".length);
      const midi = entries[`test/${groupId}.mid`];
      if (!midi) return [];
      const notes = parseStandardMidi(midi).filter(isPitchedMidiNote);
      const labels = new TextDecoder()
        .decode(entries[chordFile]!)
        .trim()
        .split(/\r?\n/)
        .flatMap((line) => {
          const match = /^(\d+(?:\.\d+)?)\s+(.+?)\s*$/.exec(line);
          if (!match) return [];
          const expected = parseCmuChordLabel(match[2]!);
          return expected ? [{ startMs: Number(match[1]), expected }] : [];
        });
      const maxEndMs = Math.max(labels.at(-1)?.startMs ?? 0, ...notes.map((note) => note.endMs));
      return labels.map((label, index) => {
        const endMs = labels[index + 1]?.startMs ?? maxEndMs;
        const overlapping = notes.filter((note) => note.endMs > label.startMs && note.startMs < endMs);
        const durationByPitchClass = Array.from({ length: 12 }, () => 0);
        const onsetCountByPitchClass = Array.from({ length: 12 }, () => 0);
        for (const note of overlapping) {
          const pitchClass = note.midi % 12;
          durationByPitchClass[pitchClass]! += Math.min(note.endMs, endMs) - Math.max(note.startMs, label.startMs);
          if (note.startMs >= label.startMs && note.startMs < endMs) onsetCountByPitchClass[pitchClass]! += 1;
        }
        const bass = overlapping.reduce((lowest, note) => Math.min(lowest, note.midi), Number.POSITIVE_INFINITY);
        return {
          corpus: "cmu-cma",
          groupId,
          expected: label.expected,
          features: {
            durationByPitchClass,
            onsetCountByPitchClass,
            ...(Number.isFinite(bass) ? { bassPitchClass: bass % 12 } : {}),
          },
        };
      });
    });
}
