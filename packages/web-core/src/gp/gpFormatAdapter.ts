import type { ScoreFormatAdapter } from "../import/types";
import { loadGpScore, type AlphaTabScoreLoader } from "./alphaTabAdapter";
import { projectAlphaTabScore } from "../musicxml/alphaTabProjection";

export function createGpFormatAdapter(loader?: AlphaTabScoreLoader): ScoreFormatAdapter {
  return {
    format: "gp",
    async parse({ bytes, signal }) {
      signal?.throwIfAborted();
      const runtime = loadGpScore(bytes, loader);
      return { runtime, ...projectAlphaTabScore(runtime as Parameters<typeof projectAlphaTabScore>[0]) };
    },
  };
}
