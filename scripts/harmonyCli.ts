import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import {
  analyzeHarmonyRules,
  createDefaultHarmonyScope,
  createMusicXmlAdapter,
  projectAlphaTabHarmonyInput,
} from "../packages/web-core/src/index";

export async function analyzeHarmonyFile(path: string) {
  const bytes = new Uint8Array(await readFile(path));
  const parsed = await createMusicXmlAdapter().parse({ fileName: basename(path), bytes });
  const model = projectAlphaTabHarmonyInput(parsed.runtime as Parameters<typeof projectAlphaTabHarmonyInput>[0]);
  const result = analyzeHarmonyRules(model, {
    ...createDefaultHarmonyScope(model),
    topK: 8,
    decisionThreshold: 0.6,
  });
  return { model, result };
}

export async function runHarmonyCli(args: string[]): Promise<unknown> {
  const path = args[0];
  const viewIndex = args.indexOf("--view");
  const view = viewIndex < 0 ? "all" : args[viewIndex + 1];
  if (!path || !["all", "model", "result"].includes(view ?? "")) {
    throw new Error("usage: harmony:cli <score.musicxml|score.mxl> [--view all|model|result]");
  }
  const report = await analyzeHarmonyFile(resolve(path));
  return view === "all" ? report : report[view as "model" | "result"];
}
