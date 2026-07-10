import type { ScoreFormat, SupportedExtension } from "./types";

const GP_EXTENSIONS = new Set<SupportedExtension>([".gp3", ".gp4", ".gp5", ".gpx", ".gp"]);
const MIDI_EXTENSIONS = new Set<SupportedExtension>([".mid", ".midi"]);

export class UnsupportedScoreFormatError extends Error {
  constructor(fileName: string) {
    super(`Unsupported score format for file: ${fileName}`);
    this.name = "UnsupportedScoreFormatError";
  }
}

export function detectScoreFormat(fileName: string): ScoreFormat {
  const extension = getLowercaseExtension(fileName);

  if (GP_EXTENSIONS.has(extension as SupportedExtension)) {
    return "gp";
  }

  if (MIDI_EXTENSIONS.has(extension as SupportedExtension)) {
    return "midi";
  }

  throw new UnsupportedScoreFormatError(fileName);
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
