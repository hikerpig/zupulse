import * as alphaTab from "@coderline/alphatab";
import type { ScoreFormatAdapter } from "../import/types";
import { MUSICXML_LIMITS, preflightMusicXml } from "./preflight";
import { projectAlphaTabScore } from "./alphaTabProjection";

export type MusicXmlScoreLoader = (bytes: Uint8Array, settings: alphaTab.Settings) => unknown;

export function createMusicXmlAdapter(loader: MusicXmlScoreLoader = defaultLoader): ScoreFormatAdapter {
  return {
    format: "musicxml",
    async parse({ bytes, signal }) {
      signal?.throwIfAborted();
      if (!(bytes[0] === 0x50 && bytes[1] === 0x4b)) preflightMusicXml(bytes);
      const settings = new alphaTab.Settings();
      settings.importer.mergePartGroupsInMusicXml = false;
      settings.importer.maxDecodingBufferSize = MUSICXML_LIMITS.maxTotalUncompressedBytes;
      const runtime = loader(bytes, settings) as Parameters<typeof projectAlphaTabScore>[0];
      signal?.throwIfAborted();
      return { runtime, ...projectAlphaTabScore(runtime) };
    },
  };
}

function defaultLoader(bytes: Uint8Array, settings: alphaTab.Settings): unknown {
  return alphaTab.importer.ScoreLoader.loadScoreFromBytes(bytes, settings);
}
