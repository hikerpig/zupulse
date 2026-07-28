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
});

function minimalPdf(): Uint8Array {
  const content = "0 0 m 100 100 l S";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << >> /Contents 4 0 R >>",
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
