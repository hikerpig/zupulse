#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";

const exitCode = Number(process.env.FAKE_AUDIVERIS_EXIT_CODE ?? 0);
if (exitCode > 0) process.exit(exitCode);

if (process.argv.includes("-version")) {
  process.stdout.write("Audiveris\n- Version:      5.5.3\n- Commit:       fake\n");
  process.exit(0);
}

const failure = process.env.FAKE_AUDIVERIS_FAILURE;
if (failure === "too-large") {
  process.stderr.write("WARN [input] SheetStub | Too large image: 27,746,510 pixels (vs 20,000,000 max)\n");
  process.exit(1);
}
if (failure === "step-timeout") {
  process.stderr.write("WARN [input] SheetStub | Timeout 120 seconds for step BEAMS\n");
  process.exit(1);
}

const delay = Number(process.env.FAKE_AUDIVERIS_DELAY_MS ?? 0);
if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
const outputIndex = process.argv.indexOf("-output");
const outputDirectory = process.argv[outputIndex + 1];
const inputPath = process.argv.at(-1);
if (outputIndex < 0 || outputDirectory === undefined || inputPath === undefined) process.exit(2);
const stem = basename(inputPath, extname(inputPath));
await mkdir(outputDirectory, { recursive: true });
await writeFile(
  join(outputDirectory, `${stem}.mxl`),
  `<?xml version="1.0"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><staff>1</staff></note>
  </measure></part>
</score-partwise>`,
);
await writeFile(join(outputDirectory, `${stem}.omr`), "fake-omr");
