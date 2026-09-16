import { access, chmod, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runPdfOmrCommand } from "../command";
import { runPdfOmrPipeline } from "../pipeline";
import { normalizeAudiverisMusicXml } from "../normalizers/audiveris";
import { sha256Bytes } from "../canonical-json";
import { createProductionEngineRegistry, type EngineRegistry } from "../engine-registry";
import type { OmrScoreDraft } from "../schemas";

const directories: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
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
                timeSignature: { numerator: 3, denominator: 4 },
                duration: { numerator: 3, denominator: 4 },
                keySignature: { fifths: 0 },
                clef: { sign: "G", line: 2 },
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
console.log(JSON.stringify({schemaVersion:'1.0.0', inputSha256, extractorVersion:'fake', pages:[{reason:'supported',measures:[0,1].map(staffIndex=>({systemIndex:0,staffIndex,measureIndex:0,keyFifths:0,reason:'supported',heads:[30,32,32].map((diatonic,i)=>({x:50+i*20,y:100,gap:5,diatonic,alter:0}))}))}]}));`;

describe("recognize pitch shadow opt-in", () => {
  it.each([
    { name: "default", flag: undefined, script: sourceScript, step: "G", outcome: "applied" },
    { name: "disabled", flag: "0", script: sourceScript, step: "F", outcome: undefined },
    {
      name: "extractor failure",
      flag: undefined,
      script: "process.exit(7)",
      step: "F",
      outcome: "extractor-unavailable",
    },
    {
      name: "unsupported source",
      flag: undefined,
      script: sourceScript.replace(/pages:.*$/, "pages:[{reason:'unsupported-staff-layout',measures:[]}]}));"),
      step: "F",
      outcome: "unchanged",
    },
  ])("exports production $name without explicit correction arguments", async ({ flag, script, step, outcome }) => {
    vi.stubEnv("PDF_OMR_LEGATO_SOURCE_PITCH_CORRECTION", flag);
    const { directory, python } = await setup(script);
    const production = createProductionEngineRegistry({
      environmentFallback: false,
      legato: {
        pythonExecutable: python,
        runnerPath: "/runner.py",
        repositoryPath: "/repository",
        repositoryRevision: "revision",
        modelPath: "/model.safetensors",
        modelSha256: "a".repeat(64),
        baseModelPath: "/base",
      },
    });
    const replay: EngineRegistry = { get: () => ({ ...production.get("legato"), ...registry.get("legato") }) };
    const outputDirectory = join(directory, "production");
    await runPdfOmrPipeline({ inputPath: input, engineId: "legato", outputDirectory, engineRegistry: replay });
    const exported = normalizeAudiverisMusicXml(await readFile(join(outputDirectory, "score.mxl")));
    expect(exported.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[1]!).toMatchObject({ writtenPitch: { step } });
    const recognition = join(outputDirectory, "recognition");
    if (outcome === undefined) {
      expect(await readdir(recognition)).not.toContain("pitch-correction");
    } else {
      expect(JSON.parse(await readFile(join(recognition, "pitch-correction/report.json"), "utf8"))).toMatchObject({
        outcome,
      });
      const raw = JSON.parse(await readFile(join(recognition, "raw-draft.json"), "utf8"));
      expect(raw.parts[0].staves[0].measures[0].voices[0].events[1].writtenPitch.step).toBe("F");
      if (step === "F")
        expect(await readFile(join(recognition, "draft.json"), "utf8")).toBe(
          await readFile(join(recognition, "raw-draft.json"), "utf8"),
        );
    }
  });

  it("rejects invalid correction flags before resolving an unavailable engine", async () => {
    await expect(
      runPdfOmrCommand(
        ["recognize", "missing.pdf", "--engine", "rokot", "--output", "unused", "--pitch-correction-python", "python3"],
        {
          engineRegistry: {
            get: () => {
              throw new Error("engine must not be resolved");
            },
          },
        },
      ),
    ).rejects.toMatchObject({ code: "INVALID_CLI_ARGUMENT" });
  });

  it("uses the Python captured by the LEGATO registry without a second host configuration", async () => {
    const { directory, python } = await setup(sourceScript);
    const captured: EngineRegistry = { get: () => ({ ...registry.get("legato"), pitchCorrectionPython: python }) };
    const outputDirectory = join(directory, "captured");
    await runPdfOmrPipeline({ inputPath: input, engineId: "legato", outputDirectory, engineRegistry: captured });
    const exported = normalizeAudiverisMusicXml(await readFile(join(outputDirectory, "score.mxl")));
    expect(exported.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[1]!).toMatchObject({
      writtenPitch: { step: "G", octave: 4, alter: 0 },
    });
  });

  it("executes an isolated extractor file outside the application archive and removes it afterwards", async () => {
    const { directory, python } = await setup(sourceScript);
    const marker = join(directory, "extractor-path.txt");
    await writeFile(
      python,
      `#!/usr/bin/env node\nrequire('node:fs').writeFileSync(${JSON.stringify(marker)}, process.argv[2]);\n${sourceScript}\n`,
    );
    await runPdfOmrCommand(
      [
        "recognize",
        input,
        "--engine",
        "legato",
        "--output",
        join(directory, "run"),
        "--pitch-correction-python",
        python,
      ],
      { engineRegistry: registry },
    );
    const extractorPath = await readFile(marker, "utf8");
    expect(extractorPath).not.toContain("tools/pdf-omr-cli/engines");
    expect(extractorPath).not.toContain(".asar/");
    await expect(access(extractorPath)).rejects.toMatchObject({ code: "ENOENT" });
    const report = JSON.parse(await readFile(join(directory, "run/pitch-correction/report.json"), "utf8"));
    expect(report.extractorSha256).toBe(sha256Bytes(await readFile("tools/pdf-omr-cli/engines/pitch_shadow.py")));
  });

  it("exports the corrected Draft through the shared programmatic pipeline", async () => {
    const { directory, python } = await setup(sourceScript);
    const outputDirectory = join(directory, "pipeline");
    const result = await runPdfOmrPipeline({
      inputPath: input,
      engineId: "legato",
      outputDirectory,
      engineRegistry: registry,
      pitchCorrectionPython: python,
    });
    expect(result.status).toBe("succeeded");
    const exported = normalizeAudiverisMusicXml(await readFile(join(outputDirectory, "score.mxl")));
    const note = exported.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[1]!;
    expect(note).toMatchObject({ type: "note", writtenPitch: { step: "G", octave: 4, alter: 0 }, soundingMidi: 67 });
  });

  it("applies corrections only when explicitly selected and preserves the original Draft", async () => {
    const { directory, python } = await setup(sourceScript);
    const result = await runPdfOmrCommand(
      [
        "recognize",
        input,
        "--engine",
        "legato",
        "--output",
        join(directory, "apply"),
        "--pitch-correction-python",
        python,
      ],
      { engineRegistry: registry },
    );
    expect(result.status).toBe("succeeded");
    const original = JSON.parse(await readFile(join(directory, "apply/raw-draft.json"), "utf8"));
    const corrected = JSON.parse(await readFile(join(directory, "apply/draft.json"), "utf8"));
    expect(original.parts[0].staves[0].measures[0].voices[0].events[1].writtenPitch.step).toBe("F");
    expect(corrected.parts[0].staves[0].measures[0].voices[0].events[1].writtenPitch.step).toBe("G");
    const report = JSON.parse(await readFile(join(directory, "apply/pitch-correction/report.json"), "utf8"));
    expect(report).toMatchObject({ mode: "apply", outcome: "applied", appliedCount: 2 });
    const manifest = JSON.parse(await readFile(join(directory, "apply/run.json"), "utf8"));
    for (const file of [
      "raw-draft.json",
      "draft.json",
      "pitch-correction/report.json",
      "pitch-correction/source.json",
    ]) {
      expect(manifest.artifactSha256[file]).toBe(sha256Bytes(await readFile(join(directory, "apply", file))));
    }
    expect(report.draftSha256).toBe(manifest.artifactSha256["raw-draft.json"]);
  });

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
    expect(manifest.parameters.pitchShadow).toBe("legato-source-pitch-shadow-v2");
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

  it.each(["--pitch-shadow-python", "--pitch-correction-python", undefined])(
    "keeps cancellation terminal: %s",
    async (flag) => {
      const { directory, python } = await setup(sourceScript);
      const abort = new AbortController();
      const cancelling: EngineRegistry = {
        get: () => ({
          ...registry.get("legato"),
          ...(flag === undefined ? { pitchCorrectionPython: python } : {}),
          recognize: async () => {
            abort.abort();
            return { normalizationBytes: new Uint8Array(), nativeArtifacts: [], diagnostics: [], durationMs: 0 };
          },
        }),
      };
      await expect(
        runPdfOmrCommand(
          [
            "recognize",
            input,
            "--engine",
            "legato",
            "--output",
            join(directory, "run"),
            ...(flag === undefined ? [] : [flag, python]),
          ],
          {
            engineRegistry: cancelling,
            signal: abort.signal,
          },
        ),
      ).rejects.toMatchObject({ code: "INTERRUPTED" });
      expect(await readdir(join(directory, "run"))).not.toContain("run.json");
    },
  );

  it.each(["--pitch-shadow-python", "--pitch-correction-python"])(
    "rejects other engines before reading input: %s",
    async (flag) => {
      await expect(
        runPdfOmrCommand(["recognize", "missing.pdf", "--engine", "rokot", "--output", "run", flag, "python3"], {
          engineRegistry: registry,
        }),
      ).rejects.toMatchObject({ code: "INVALID_CLI_ARGUMENT", context: { engineId: "rokot" } });
    },
  );

  it("falls back to identical raw output when correction evidence is unavailable", async () => {
    const { directory, python } = await setup("process.exit(7)");
    await runPdfOmrCommand(
      [
        "recognize",
        input,
        "--engine",
        "legato",
        "--output",
        join(directory, "run"),
        "--pitch-correction-python",
        python,
      ],
      { engineRegistry: registry },
    );
    expect(await readFile(join(directory, "run/draft.json"), "utf8")).toBe(
      await readFile(join(directory, "run/raw-draft.json"), "utf8"),
    );
    const report = JSON.parse(await readFile(join(directory, "run/pitch-correction/report.json"), "utf8"));
    expect(report).toMatchObject({ outcome: "extractor-unavailable", appliedCount: 0, writebackReady: false });
    expect(JSON.stringify(report)).not.toContain(directory);
  });

  it("rejects simultaneous shadow and correction before touching input or outputs", async () => {
    await expect(
      runPdfOmrCommand(
        [
          "recognize",
          "missing.pdf",
          "--engine",
          "legato",
          "--output",
          "unused",
          "--pitch-shadow-python",
          "python3",
          "--pitch-correction-python",
          "python3",
        ],
        { engineRegistry: registry },
      ),
    ).rejects.toMatchObject({ code: "INVALID_CLI_ARGUMENT" });
  });
});
