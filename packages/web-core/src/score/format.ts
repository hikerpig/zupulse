import type { ScoreFormat, SupportedExtension } from "./types";

const GP_EXTENSIONS = new Set<SupportedExtension>([".gp3", ".gp4", ".gp5", ".gpx", ".gp"]);
const MIDI_EXTENSIONS = new Set<SupportedExtension>([".mid", ".midi"]);
const MUSICXML_EXTENSIONS = new Set<SupportedExtension>([".musicxml", ".mxl"]);

export class UnsupportedScoreFormatError extends Error {
  constructor(fileName: string) {
    super(`Unsupported score format for file: ${fileName}`);
    this.name = "UnsupportedScoreFormatError";
  }
}

export function detectScoreFormat(fileName: string): ScoreFormat {
  const hint = getScoreFormatHint(fileName);
  if (hint !== undefined) return hint;

  throw new UnsupportedScoreFormatError(fileName);
}

/** Extension-only hint. It is never a content validation boundary. */
export function getScoreFormatHint(fileName: string): ScoreFormat | undefined {
  const extension = getLowercaseExtension(fileName);

  if (GP_EXTENSIONS.has(extension as SupportedExtension)) {
    return "gp";
  }

  if (MIDI_EXTENSIONS.has(extension as SupportedExtension)) {
    return "midi";
  }
  if (MUSICXML_EXTENSIONS.has(extension as SupportedExtension)) {
    return "musicxml";
  }
  return undefined;
}

export function isSupportedScoreFile(fileName: string): boolean {
  try {
    detectScoreFormat(fileName);
    return true;
  } catch (error) {
    if (error instanceof UnsupportedScoreFormatError) {
      return false;
    }
    throw error;
  }
}

function getLowercaseExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot < 0) {
    return "";
  }
  return fileName.slice(lastDot).toLowerCase();
}
