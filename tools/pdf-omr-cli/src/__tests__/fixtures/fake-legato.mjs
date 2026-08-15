#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";

const args = process.argv.slice(2);
if (args[0] === "--version") {
  process.stdout.write("Python 3.11.9\n");
  process.exit(0);
}
if (args[0] === "-C") {
  process.stdout.write(`${process.env.FAKE_LEGATO_REVISION ?? "8c1de27e414f487fe59086547aaae23b868ed6ca"}\n`);
  process.exit(0);
}
if (args[0]?.endsWith("legato-runner.py") && args[1] === "inspect") {
  process.stdout.write(JSON.stringify({ pageCount: Number(process.env.FAKE_LEGATO_PAGES ?? "1") }));
  process.exit(0);
}
if (args[0]?.endsWith("legato-runner.py") && args[1] === "recognize") {
  const pageOutputDirectory = args[args.indexOf("--page-output-directory") + 1];
  const telemetryOutput = args[args.indexOf("--telemetry-output") + 1];
  const maxLength = Number(args[args.indexOf("--max-length") + 1]);
  if (process.env.FAKE_LEGATO_CONVERSION_FAILURE === "1") process.exit(17);
  await emitOutputs(pageOutputDirectory, telemetryOutput, maxLength);
  process.exit(0);
}
if (args[0]?.endsWith("legato-runner.py") && args[1] === "worker") {
  const maxLength = Number(args[args.indexOf("--max-length") + 1]);
  const stderrBytes = Number(process.env.FAKE_LEGATO_WORKER_STDERR_BYTES ?? "0");
  if (stderrBytes > 0) {
    await new Promise((resolve) => process.stderr.write("x".repeat(stderrBytes), resolve));
  }
  if (process.env.FAKE_LEGATO_WORKER_MARKER !== undefined) {
    const previous = await readFile(process.env.FAKE_LEGATO_WORKER_MARKER, "utf8").catch(() => "");
    await writeFile(process.env.FAKE_LEGATO_WORKER_MARKER, `${previous}load\n`);
  }
  process.stdout.write(`${JSON.stringify({ type: "ready", modelLoadMs: 5 })}\n`);
  const lines = createInterface({ input: process.stdin });
  for await (const line of lines) {
    const request = JSON.parse(line);
    if (request.type === "shutdown") process.exit(0);
    try {
      const delayMs = Number(process.env.FAKE_LEGATO_WORKER_DELAY_MS ?? "0");
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
      await emitOutputs(request.pageOutputDirectory, request.telemetryOutputPath, maxLength);
      process.stdout.write(
        `${JSON.stringify({
          type: "result",
          id: request.id,
          ok: process.env.FAKE_LEGATO_WORKER_STRING_OK === "1" ? "yes" : true,
        })}\n`,
      );
    } catch {
      process.stdout.write(
        `${JSON.stringify({ type: "result", id: request.id, ok: false, reason: "fixture-failure" })}\n`,
      );
    }
  }
  process.exit(0);
}
if (args[0] === "hash-model") {
  const modelPath = args[1];
  process.stdout.write(await readFile(modelPath, "utf8"));
  process.exit(0);
}
process.exit(2);

async function emitOutputs(pageOutputDirectory, telemetryOutput, maxLength) {
  const pageCount = Number(process.env.FAKE_LEGATO_PAGES ?? "1");
  if (process.env.FAKE_LEGATO_CONVERSION_FAILURE === "1") throw new Error("fixture failure");
  await mkdir(pageOutputDirectory, { recursive: true });
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const prefix = `page-${String(pageNumber).padStart(3, "0")}`;
    await writeFile(
      `${pageOutputDirectory}/${prefix}.abc`,
      process.env.FAKE_LEGATO_EMPTY_ABC === "1"
        ? ""
        : `X:1\nT:Fixture page ${pageNumber}\nM:4/4\nL:1/4\nK:C\nC D E F |]\n`,
    );
    await writeFile(
      `${pageOutputDirectory}/${prefix}.musicxml`,
      process.env.FAKE_LEGATO_EMPTY_SECOND_PART === "1"
        ? `<?xml version="1.0"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Right hand</part-name></score-part>
    <score-part id="P2"><part-name>Left hand</part-name></score-part>
  </part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice></note>
  </measure></part>
  <part id="P2"><measure number="1" /></part>
</score-partwise>`
        : `<?xml version="1.0"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice></note>
  </measure></part>
</score-partwise>`,
    );
  }
  await writeFile(
    telemetryOutput,
    `${JSON.stringify({
      schemaVersion: "1.0.0",
      pages: Array.from({ length: pageCount }, (_, pageIndex) => ({
        pageNumber: pageIndex + 1,
        outputTokenCount: Number(process.env.FAKE_LEGATO_OUTPUT_TOKENS ?? "64"),
        maxLength,
        termination: process.env.FAKE_LEGATO_TERMINATION ?? "eos",
        device: process.env.FAKE_LEGATO_DEVICE ?? "mps",
        dtype: process.env.FAKE_LEGATO_DTYPE ?? "float16",
      })),
    })}\n`,
  );
}
