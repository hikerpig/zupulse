#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";

if (process.argv.includes("-version")) {
  process.stdout.write("Audiveris 5.5.3\n");
  process.exit(0);
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
  '<?xml version="1.0"?><score-partwise version="4.0"></score-partwise>',
);
await writeFile(join(outputDirectory, `${stem}.omr`), "fake-omr");
