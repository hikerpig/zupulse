import { performance } from "node:perf_hooks";
import { readdir } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { inspectHarmonyScore } from "../inspectScore";

export async function evaluateAsapCorpus(root: string, options: { id: string; include?: readonly string[] }) {
  const allFiles = await scoreFiles(root);
  const files = allFiles.filter((path) => {
    if (options.include === undefined) return true;
    return options.include.includes(relative(root, path));
  });
  if (files.length === 0) throw new Error(`no ASAP MusicXML files found in ${root}`);

  let parsed = 0;
  let failed = 0;
  let notes = 0;
  let measures = 0;
  let segments = 0;
  let runtimeMs = 0;
  for (const path of files) {
    const start = performance.now();
    try {
      const inspected = await inspectHarmonyScore(path, "all");
      parsed += 1;
      measures += inspected.model.measures.length;
      notes += inspected.model.tracks.reduce(
        (sum, track) => sum + track.staves.reduce((staffSum, staff) => staffSum + staff.notes.length, 0),
        0,
      );
      segments += inspected.result.length;
    } catch {
      failed += 1;
    } finally {
      runtimeMs += performance.now() - start;
    }
  }
  return {
    id: options.id,
    kind: "ingestion-corpus" as const,
    adapter: "asap" as const,
    status: failed === 0 ? ("passed" as const) : ("failed" as const),
    files: files.length,
    parsed,
    failed,
    notes,
    measures,
    segments,
    runtimeMs,
  };
}

async function scoreFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = resolve(root, entry.name);
      if (entry.isDirectory()) return scoreFiles(path);
      return /\.(?:musicxml|xml|mxl)$/i.test(entry.name) ? [path] : [];
    }),
  );
  return nested.flat().sort();
}
