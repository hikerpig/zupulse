import { resolve } from "node:path";
import { inspectHarmonyScore, type InspectView } from "./inspectScore";
import { harmonyInspectReportSchema, type HarmonyInspectReport } from "./schemas";

export async function runHarmonyCommand(args: string[], context: { cwd?: string } = {}): Promise<HarmonyInspectReport> {
  const normalized = args[0] === "--" ? args.slice(1) : args;
  const positional = normalized[0] === "inspect" ? normalized.slice(1) : normalized;
  const path = positional[0];
  const viewIndex = positional.indexOf("--view");
  const view = (viewIndex < 0 ? "all" : positional[viewIndex + 1]) as InspectView | undefined;
  if (!path || !view || !["all", "model", "result"].includes(view)) {
    throw new Error("usage: harmony:cli inspect <score.musicxml|score.mxl> [--view all|model|result]");
  }
  const inspected = await inspectHarmonyScore(
    resolve(context.cwd ?? process.env.INIT_CWD ?? process.cwd(), path),
    view,
  );
  return harmonyInspectReportSchema.parse({
    schemaVersion: "1.0.0",
    command: "inspect",
    source: inspected.source,
    ...(view === "result" ? {} : { model: inspected.model }),
    ...(view === "model" ? {} : { result: inspected.result }),
  });
}
