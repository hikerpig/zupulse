import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import {
  analyzeHarmony,
  createDefaultHarmonyScope,
  createMusicXmlAdapter,
  projectAlphaTabHarmonyInput,
} from "@zupulse/web-core";

export type InspectView = "all" | "model" | "result";

export async function inspectHarmonyScore(path: string, view: InspectView) {
  const bytes = new Uint8Array(await readFile(path));
  const parsed = await createMusicXmlAdapter().parse({ fileName: basename(path), bytes });
  const model = projectAlphaTabHarmonyInput(parsed.runtime as Parameters<typeof projectAlphaTabHarmonyInput>[0]);
  const result = analyzeHarmony(model, {
    ...createDefaultHarmonyScope(model),
    topK: 8,
    decisionThreshold: 0.6,
  });
  return {
    source: { name: basename(path), sha256: createHash("sha256").update(bytes).digest("hex") },
    model,
    result,
    view,
  };
}
