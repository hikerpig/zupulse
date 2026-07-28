#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";

const args = process.argv.slice(2);
if (args[0] === "--version") {
  process.stdout.write("Python 3.11.9\n");
  process.exit(0);
}
if (args[0] === "-C") {
  process.stdout.write(`${process.env.FAKE_TRANSCODA_REVISION ?? "d4e2e687d5679ae96ca4aa6f01e06a5b338cd488"}\n`);
  process.exit(0);
}
if (args.includes("scripts/inference.py")) {
  const output = args[args.indexOf("--output") + 1];
  await writeFile(
    output,
    process.env.FAKE_TRANSCODA_INVALID_KERN === "1" ? "**kern\t**kern\n4c\n*-\t*-\n" : "**kern\n*M4/4\n1c\n",
  );
  process.exit(0);
}
if (args[0]?.endsWith("transcoda-kern-to-musicxml.py")) {
  const input = args[1];
  const output = args[2];
  const kern = await readFile(input, "utf8");
  if (!kern.endsWith("*-\n")) process.exit(17);
  await writeFile(
    output,
    `<?xml version="1.0"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice></note>
  </measure></part>
</score-partwise>`,
  );
  process.exit(0);
}
if (args.includes("-png")) {
  const prefix = args.at(-1);
  await writeFile(`${prefix}-1.png`, "fake-png");
  if (process.env.FAKE_TRANSCODA_PAGES === "2") {
    await writeFile(`${prefix}-2.png`, "fake-png");
  }
  process.exit(0);
}
process.exit(2);
