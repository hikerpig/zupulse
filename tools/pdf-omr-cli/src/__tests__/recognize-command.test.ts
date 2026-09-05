import { createHash } from "node:crypto";
import { access, chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runPdfOmrCommand } from "../command";
import { createEngineRegistry } from "../engine-registry";

const fixture = fileURLToPath(new URL("fixtures/fake-audiveris.mjs", import.meta.url));

describe("recognize command", () => {
  it("writes a complete PDF to Draft run with canonical artifact hashes", async () => {
    await chmod(fixture, 0o755);
    const directory = await mkdtemp(join(tmpdir(), "pdf-omr-recognize-"));
    const inputPath = join(directory, "score.pdf");
    const outputPath = join(directory, "run");
    await writeFile(inputPath, minimalPdf());
    const registry = createEngineRegistry({ audiverisExecutable: fixture });

    const report = await runPdfOmrCommand(["recognize", inputPath, "--engine", "audiveris", "--output", outputPath], {
      engineRegistry: registry,
    });

    expect(report).toMatchObject({ command: "recognize", status: "succeeded" });
    const manifest = JSON.parse(await readFile(join(outputPath, "run.json"), "utf8")) as {
      status: string;
      artifactSha256: Record<string, string>;
    };
    expect(manifest.status).toBe("succeeded");
    expect(Object.keys(manifest.artifactSha256).sort()).toEqual([
      "diagnostics.json",
      "draft.json",
      "engine/environment.json",
      "engine/raw-output.mxl",
      "engine/raw-output.omr",
      "input.json",
    ]);
    const draft = JSON.parse(await readFile(join(outputPath, "draft.json"), "utf8")) as {
      parts: unknown[];
    };
    expect(draft.parts).toHaveLength(1);
  });

  it("produces the same Draft hash for repeated recognition", async () => {
    await chmod(fixture, 0o755);
    const directory = await mkdtemp(join(tmpdir(), "pdf-omr-repeat-"));
    const inputPath = join(directory, "score.pdf");
    await writeFile(inputPath, minimalPdf());
    const registry = createEngineRegistry({ audiverisExecutable: fixture });

    const first = await runPdfOmrCommand(
      ["recognize", inputPath, "--engine", "audiveris", "--output", join(directory, "first")],
      { engineRegistry: registry },
    );
    const second = await runPdfOmrCommand(
      ["recognize", inputPath, "--engine", "audiveris", "--output", join(directory, "second")],
      { engineRegistry: registry },
    );

    expect(first).toMatchObject({ draftSha256: expect.any(String) });
    expect(second).toMatchObject({ draftSha256: first.command === "recognize" ? first.draftSha256 : "" });
  });

  it("rejects unknown engines before creating a succeeded manifest", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pdf-omr-engine-"));
    const inputPath = join(directory, "score.pdf");
    await writeFile(inputPath, minimalPdf());

    await expect(
      runPdfOmrCommand(["recognize", inputPath, "--engine", "unknown", "--output", join(directory, "run")]),
    ).rejects.toMatchObject({
      code: "INVALID_CLI_ARGUMENT",
      context: { engineId: "unknown" },
    });
  });

  it("does not commit a succeeded run when Audiveris crashes", async () => {
    await chmod(fixture, 0o755);
    const directory = await mkdtemp(join(tmpdir(), "pdf-omr-crash-"));
    const inputPath = join(directory, "score.pdf");
    const outputPath = join(directory, "run");
    await writeFile(inputPath, minimalPdf());
    const registry = createEngineRegistry({
      audiverisExecutable: fixture,
      audiverisEnvironment: { FAKE_AUDIVERIS_EXIT_CODE: "17" },
    });

    await expect(
      runPdfOmrCommand(["recognize", inputPath, "--engine", "audiveris", "--output", outputPath], {
        engineRegistry: registry,
      }),
    ).rejects.toMatchObject({ code: "ENGINE_EXECUTION_FAILED" });
    await expect(access(join(outputPath, "run.json"))).rejects.toBeDefined();
  });

  it("runs deterministic two-system Rokot recognition through validation, analysis, and export", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pdf-omr-rokot-command-"));
    const inputPath = join(directory, "score.pdf");
    const llamaPath = join(directory, "llama-cli");
    const pythonPath = join(directory, "abc2xml-python");
    const runnerPath = join(directory, "runner.py");
    const modelPath = join(directory, "model.gguf");
    const mmprojPath = join(directory, "mmproj.gguf");
    const model = new TextEncoder().encode("test-rokot-model");
    const mmproj = new TextEncoder().encode("test-rokot-mmproj");
    await Promise.all([
      writeFile(inputPath, grandStaffPdf()),
      writeFile(modelPath, model),
      writeFile(mmprojPath, mmproj),
      writeFile(runnerPath, "# fake runner boundary\n"),
      writeFile(llamaPath, fakeRokotLlama()),
      writeFile(pythonPath, fakeRokotConverter()),
    ]);
    await Promise.all([chmod(llamaPath, 0o755), chmod(pythonPath, 0o755)]);
    const registry = createEngineRegistry({
      rokot: {
        llamaCliPath: llamaPath,
        modelPath,
        mmprojPath,
        abc2xmlPythonPath: pythonPath,
        abc2xmlRunnerPath: runnerPath,
        modelSha256: createHash("sha256").update(model).digest("hex"),
        mmprojSha256: createHash("sha256").update(mmproj).digest("hex"),
      },
    });
    const firstPath = join(directory, "first");
    const secondPath = join(directory, "second");

    const first = await runPdfOmrCommand(["recognize", inputPath, "--engine", "rokot", "--output", firstPath], {
      engineRegistry: registry,
    });
    const second = await runPdfOmrCommand(["recognize", inputPath, "--engine", "rokot", "--output", secondPath], {
      engineRegistry: registry,
    });

    expect(first).toMatchObject({ command: "recognize", status: "succeeded" });
    expect(second).toMatchObject({
      command: "recognize",
      draftSha256: first.command === "recognize" ? first.draftSha256 : "",
    });
    const firstManifest = JSON.parse(await readFile(join(firstPath, "run.json"), "utf8")) as {
      artifactSha256: Record<string, string>;
    };
    const secondManifest = JSON.parse(await readFile(join(secondPath, "run.json"), "utf8")) as {
      artifactSha256: Record<string, string>;
    };
    expect(secondManifest.artifactSha256).toEqual(firstManifest.artifactSha256);
    expect(Object.keys(firstManifest.artifactSha256)).toEqual(
      expect.arrayContaining([
        "engine/segmentation.json",
        "engine/systems/page-001-system-001.png",
        "engine/systems/page-001-system-001.abc",
        "engine/systems/page-001-system-001.musicxml",
        "engine/systems/page-001-system-002.png",
        "engine/systems/page-001-system-002.abc",
        "engine/systems/page-001-system-002.musicxml",
      ]),
    );
    expect(firstManifest).toMatchObject({
      parameters: {
        segmentationAllowFragmentedRuns: true,
        segmentationStaffLayout: "auto",
      },
    });
    const identityPath = join(directory, "identity");
    await runPdfOmrCommand(
      ["recognize", inputPath, "--engine", "rokot", "--output", identityPath, "--segmentation", "piano-grand-staff-v1"],
      { engineRegistry: registry },
    );
    const identityManifest = JSON.parse(await readFile(join(identityPath, "run.json"), "utf8")) as {
      parameters: Record<string, unknown>;
    };
    const identitySegmentation = JSON.parse(
      await readFile(join(identityPath, "engine/segmentation.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(identityManifest.parameters).toMatchObject({
      segmentationId: "piano-grand-staff-v1",
      segmentationAllowFragmentedRuns: false,
      segmentationStaffLayout: "grand-staff",
      segmentationPairAdjacentUnpairedGroups: false,
    });
    expect(identitySegmentation).toMatchObject({
      identity: "piano-grand-staff-v1",
      options: { staffLayout: "grand-staff", allowFragmentedRuns: false, pairAdjacentUnpairedGroups: false },
    });

    await expect(
      runPdfOmrCommand(["validate", join(firstPath, "draft.json"), "--output", join(directory, "validation.json")]),
    ).resolves.toMatchObject({ command: "validate", readiness: { harmony: "ready", musicXml: "ready" } });
    await expect(
      runPdfOmrCommand(["analyze", join(firstPath, "draft.json"), "--output", join(directory, "harmony.json")]),
    ).resolves.toMatchObject({ command: "analyze", status: "succeeded" });
    await expect(
      runPdfOmrCommand(["export-musicxml", join(firstPath, "draft.json"), "--output", join(directory, "score.mxl")]),
    ).resolves.toMatchObject({ command: "export-musicxml", status: "succeeded" });
  });
});

function fakeRokotLlama(): string {
  return `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
if (args[0] === "--version") process.stdout.write("version: 10200 (5f55650a7)\\n");
else fs.writeFileSync(args[args.indexOf("-o") + 1], ${JSON.stringify(validRokotAbc())});
`;
}

function fakeRokotConverter(): string {
  return `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
if (args[1] === "inspect") process.stdout.write(JSON.stringify({ version: "1.0.1" }));
else fs.writeFileSync(args[args.indexOf("--output") + 1], ${JSON.stringify(validRokotMusicXml())});
`;
}

function validRokotAbc(): string {
  return `%%rokot-abc 0.1
X:1
M:2/4
L:1/8
K:C
V:1 clef=treble
V:2 clef=bass
[V:1] C4 |
[V:2] C,4 |
`;
}

function validRokotMusicXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Treble</part-name></score-part>
    <score-part id="P2"><part-name>Bass</part-name></score-part>
  </part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>2</divisions><key><fifths>0</fifths></key><time><beats>2</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice></note>
  </measure></part>
  <part id="P2"><measure number="1">
    <attributes><divisions>2</divisions><key><fifths>0</fifths></key><time><beats>2</beats><beat-type>4</beat-type></time><clef><sign>F</sign><line>4</line></clef></attributes>
    <note><pitch><step>C</step><octave>3</octave></pitch><duration>4</duration><voice>1</voice></note>
  </measure></part>
</score-partwise>`;
}

function grandStaffPdf(): Uint8Array {
  const systems = [
    [220, 216, 212, 208, 204, 190, 186, 182, 178, 174],
    [110, 106, 102, 98, 94, 80, 76, 72, 68, 64],
  ];
  const content = systems
    .flatMap((lines) => [...lines.map((y) => `10 ${y} m 190 ${y} l S`), `10 ${lines[0]} m 10 ${lines[9]} l S`])
    .join(" ");
  return buildPdf(200, 260, `0 0 0 RG 0.3 w ${content}`);
}

function minimalPdf(): Uint8Array {
  return buildPdf(200, 200, "0 0 m 100 100 l S");
}

function buildPdf(width: number, height: number, content: string): Uint8Array {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << >> /Contents 4 0 R >>`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let source = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(new TextEncoder().encode(source).byteLength);
    source += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = new TextEncoder().encode(source).byteLength;
  source += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  source += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  source += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(source);
}
