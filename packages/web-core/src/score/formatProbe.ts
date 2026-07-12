import type { ImportDiagnostic } from '../import/diagnostics';
import { createImportDiagnostic, ImportPreflightError } from '../import/diagnostics';
import { preflightMusicXml, type MusicXmlPreflight } from '../musicxml/preflight';
import { getScoreFormatHint } from './format';
import type { ScoreFormat } from './types';

export type FormatProbeResult =
  | {
      status: 'confirmed';
      format: Exclude<ScoreFormat, 'midi'>;
      extensionHint?: ScoreFormat;
      evidence: string;
      preflight?: MusicXmlPreflight;
    }
  | { status: 'unsupported' | 'malformed'; extensionHint?: ScoreFormat; diagnostic: ImportDiagnostic };

export async function probeScoreFormat(fileName: string, bytes: Uint8Array): Promise<FormatProbeResult> {
  const extensionHint = getScoreFormatHint(fileName);
  const optionalHint = extensionHint === undefined ? {} : { extensionHint };
  const gpHeader = 'FICHIER GUITAR PRO';
  if (
    startsAscii(bytes, gpHeader) ||
    (bytes[0] !== undefined &&
      bytes[0] >= gpHeader.length &&
      bytes.length > bytes[0] &&
      startsAscii(bytes.subarray(1), gpHeader)) ||
    (bytes[0] === 0x50 && bytes[1] === 0x4b && extensionHint === 'gp')
  ) {
    return { status: 'confirmed', format: 'gp', ...optionalHint, evidence: 'gp-header' };
  }
  const prefix = new TextDecoder().decode(bytes.slice(0, Math.min(bytes.length, 4096)));
  if (/^\s*(?:<\?xml[\s\S]*?\?>\s*)?(?:<!DOCTYPE[\s\S]*?>\s*)?<score-(?:partwise|timewise)\b/i.test(prefix)) {
    try {
      return {
        status: 'confirmed',
        format: 'musicxml',
        ...optionalHint,
        evidence: 'musicxml-root',
        preflight: preflightMusicXml(bytes),
      };
    } catch (error) {
      const malformed = error instanceof ImportPreflightError && error.code === 'malformed-score';
      return {
        status: malformed ? 'malformed' : 'unsupported',
        ...optionalHint,
        diagnostic: createImportDiagnostic(malformed ? 'malformed-score' : 'unsupported-format'),
      };
    }
  }
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    if (containsAscii(bytes, 'META-INF/container.xml')) {
      return { status: 'confirmed', format: 'musicxml', ...optionalHint, evidence: 'mxl-container' };
    }
    return extensionHint === 'musicxml'
      ? { status: 'malformed', ...optionalHint, diagnostic: createImportDiagnostic('malformed-score') }
      : { status: 'unsupported', ...optionalHint, diagnostic: createImportDiagnostic('unsupported-format') };
  }
  return { status: 'unsupported', ...optionalHint, diagnostic: createImportDiagnostic('unsupported-format') };
}

function containsAscii(bytes: Uint8Array, value: string): boolean {
  const needle = new TextEncoder().encode(value);
  outer: for (let offset = 0; offset <= bytes.length - needle.length; offset++) {
    for (let index = 0; index < needle.length; index++) if (bytes[offset + index] !== needle[index]) continue outer;
    return true;
  }
  return false;
}

function startsAscii(bytes: Uint8Array, value: string): boolean {
  if (bytes.length < value.length) return false;
  return [...value].every((character, index) => bytes[index] === character.charCodeAt(0));
}
