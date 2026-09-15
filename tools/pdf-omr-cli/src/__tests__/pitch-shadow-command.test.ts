import { chmod, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runPdfOmrCommand } from "../command";
import { sha256Bytes } from "../canonical-json";
import type { EngineRegistry } from "../engine-registry";
import type { OmrScoreDraft } from "../schemas";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((p) => rm(p, { recursive: true, force: true })));
});
const registry: EngineRegistry = {
  get: () => ({
    inspectEnvironment: async () => ({
      id: "legato",
      version: "fake",
      executable: "fake",
      commandTemplate: [],
      license: { id: "test", source: "fixture" },
    }),
    recognize: async () => ({
      normalizationBytes: new Uint8Array(),
      nativeArtifacts: [],
      diagnostics: [],
      durationMs: 0,
    }),
    normalize: (): OmrScoreDraft => ({
      schemaVersion: "1.0.0",
      diagnostics: [],
      parts: [
        {
          id: "p",
          name: "Piano",
          staves: [0, 1].map((index) => ({
            index,
            measures: [
              {
                index: 0,
                voices: [
                  {
                    index: 1,
                    events: ["E", "F", "G"].map((step, i) => ({
                      type: "note" as const,
                      id: `${index}-${i}`,
                      onset: { numerator: i, denominator: 4 },
                      duration: { numerator: 1, denominator: 4 },
                      writtenPitch: { step: step as "E" | "F" | "G", octave: 4, alter: 0 },
                      soundingMidi: [64, 65, 67][i]!,
                    })),
                  },
                ],
              },
            ],
          })),
        },
      ],
    }),
  }),
};

async function setup(script: string) {
  const directory = await mkdtemp(join(tmpdir(), "legato-shadow-test-"));
  directories.push(directory);
  const python = join(directory, "python");
  await writeFile(python, `#!/usr/bin/env node\n${script}\n`);
  await chmod(python, 0o755);
  return { directory, python };
}
const input = resolve("tools/pdf-omr-cli/corpus/smoke/input.pdf");
const sourceScript = `const fs = require('node:fs'); const crypto = require('node:crypto');
const inputSha256 = crypto.createHash('sha256').update(fs.readFileSync(process.argv[3])).digest('hex');
console.log(JSON.stringify({schemaVersion:'1.0.0', inputSha256, extractorVersion:'fake', pages:[{reason:'supported',measures:[0,1].map(staffIndex=>({systemIndex:0,staffIndex,measureIndex:0,reason:'supported',heads:[30,32,32].map((diatonic,i)=>({x:50+i*20,y:100,gap:5,diatonic}))}))}]}));`;

describe("recognize pitch shadow opt-in", () => {
  it("adds hash-bound evidence without changing default Draft or diagnostics", async () => {
    const { directory, python } = await setup(sourceScript);
    const run = (name: string, flags: string[] = []) =>
      runPdfOmrCommand(["recognize", input, "--engine", "legato", "--output", join(directory, name), ...flags], {
        engineRegistry: registry,
      });
    await run("plain");
    await run("shadow", ["--pitch-shadow-python", python]);
    for (const file of ["draft.json", "diagnostics.json"]) {
      expect(await readFile(join(directory, "shadow", file), "utf8")).toBe(
        await readFile(join(directory, "plain", file), "utf8"),
      );
    }
    expect(await readdir(join(directory, "plain"))).not.toContain("pitch-shadow");
    const report = JSON.parse(await readFile(join(directory, "shadow/pitch-shadow/report.json"), "utf8"));
    expect(report.reason, JSON.stringify(report)).toBe("completed");
    expect(report.suggestions).toHaveLength(2);
    const manifest = JSON.parse(await readFile(join(directory, "shadow/run.json"), "utf8"));
    expect(manifest.parameters.pitchShadow).toBe("legato-diatonic-shadow-v1");
    for (const file of ["pitch-shadow/report.json", "pitch-shadow/source.json"]) {
      expect(manifest.artifactSha256[file]).toBe(sha256Bytes(await readFile(join(directory, "shadow", file))));
    }
    expect(report.draftSha256).toBe(manifest.artifactSha256["draft.json"]);
  });

  it.each(["process.exit(7)", "console.log('{}')"])("isolates extractor failure: %s", async (script) => {
    const { directory, python } = await setup(script);
    await expect(
      runPdfOmrCommand(
        ["recognize", input, "--engine", "legato", "--output", join(directory, "run"), "--pitch-shadow-python", python],
        { engineRegistry: registry },
      ),
    ).resolves.toMatchObject({ status: "succeeded" });
    const report = JSON.parse(await readFile(join(directory, "run/pitch-shadow/report.json"), "utf8"));
    expect(report).toMatchObject({ reason: "extractor-unavailable", writebackReady: false, suggestions: [] });
    expect(JSON.stringify(report)).not.toContain(directory);
  });

  it("uses the same private input snapshot when the original file changes during inference", async () => {
    const { directory, python } = await setup(sourceScript);
    const original = join(directory, "original.pdf");
    const bytes = await readFile(input);
    await writeFile(original, bytes);
    const changing: EngineRegistry = {
      get: () => ({
        ...registry.get("legato"),
        recognize: async (request) => {
          expect(request.inputPath).not.toBe(original);
          expect(await readFile(request.inputPath)).toEqual(bytes);
          await writeFile(original, "changed after selection");
          return { normalizationBytes: new Uint8Array(), nativeArtifacts: [], diagnostics: [], durationMs: 0 };
        },
      }),
    };
    await runPdfOmrCommand(
      [
        "recognize",
        original,
        "--engine",
        "legato",
        "--output",
        join(directory, "run"),
        "--pitch-shadow-python",
        python,
      ],
      { engineRegistry: changing },
    );
    const report = JSON.parse(await readFile(join(directory, "run/pitch-shadow/report.json"), "utf8"));
    expect(report).toMatchObject({ reason: "completed", inputSha256: sha256Bytes(bytes) });
    expect(report.suggestions).toHaveLength(2);
  });

  it("keeps cancellation terminal instead of converting it to a shadow rejection", async () => {
    const { directory, python } = await setup(sourceScript);
    const abort = new AbortController();
    const cancelling: EngineRegistry = {
      get: () => ({
        ...registry.get("legato"),
        recognize: async () => {
          abort.abort();
          return { normalizationBytes: new Uint8Array(), nativeArtifacts: [], diagnostics: [], durationMs: 0 };
        },
      }),
    };
    await expect(
      runPdfOmrCommand(
        ["recognize", input, "--engine", "legato", "--output", join(directory, "run"), "--pitch-shadow-python", python],
        { engineRegistry: cancelling, signal: abort.signal },
      ),
    ).rejects.toMatchObject({ code: "INTERRUPTED" });
    expect(await readdir(join(directory, "run"))).not.toContain("run.json");
  });

  it("rejects the flag on other engines before reading input", async () => {
    await expect(
      runPdfOmrCommand(
        ["recognize", "missing.pdf", "--engine", "rokot", "--output", "run", "--pitch-shadow-python", "python3"],
        { engineRegistry: registry },
      ),
    ).rejects.toMatchObject({ code: "INVALID_CLI_ARGUMENT", context: { engineId: "rokot" } });
  });
});
