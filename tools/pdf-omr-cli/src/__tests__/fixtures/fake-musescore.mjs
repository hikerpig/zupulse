#!/usr/bin/env node
import { copyFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const args = process.argv.slice(2);
if (args[0] === "--version") {
  process.stdout.write("MuseScore 4.6.2\n");
  process.exit(0);
}
const outputIndex = args.indexOf("-o");
const input = args.at(-1);
if (outputIndex < 0 || input === undefined || process.env.FAKE_MUSESCORE_FAIL === "1") process.exit(7);
await copyFile(join(dirname(input), "musescore-output.musicxml"), args[outputIndex + 1]);
