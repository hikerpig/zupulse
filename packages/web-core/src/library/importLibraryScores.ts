import { createContentHash } from "../score/identity";
import { getScoreFormatHint } from "../score/format";
import { probeScoreFormat } from "../score/formatProbe";
import type { ScoreFormatAdapter } from "../import/types";
import type { SheetLibraryRepository } from "./ports";
import type { ImportItemResult, LibraryImportError, ScoreImportSource, ValidatedLibraryScoreDraft } from "./types";

export const MAX_LIBRARY_IMPORT_BYTES = 64 * 1024 * 1024;

export function isSupportedLibraryScoreFile(fileName: string): boolean {
  const format = getScoreFormatHint(fileName);
  return format === "gp" || format === "musicxml";
}

export async function importLibraryScores(input: {
  sources: readonly ScoreImportSource[];
  repository: SheetLibraryRepository;
  adapters: readonly ScoreFormatAdapter[];
  signal?: AbortSignal;
  onResult?(result: ImportItemResult, index: number): void | Promise<void>;
}): Promise<readonly ImportItemResult[]> {
  const results: ImportItemResult[] = [];
  for (const [index, source] of input.sources.entries()) {
    if (input.signal?.aborted) break;
    const result = await importOne(source, input.repository, input.adapters, input.signal);
    if (result === undefined) break;
    results.push(result);
    await input.onResult?.(result, index);
  }
  return results;
}

async function importOne(
  source: ScoreImportSource,
  repository: SheetLibraryRepository,
  adapters: readonly ScoreFormatAdapter[],
  signal?: AbortSignal,
): Promise<ImportItemResult | undefined> {
  try {
    const bytes = await source.readBytes();
    if (bytes.byteLength > MAX_LIBRARY_IMPORT_BYTES) return failed(source.fileName, "FILE_TOO_LARGE");
    if (!isSupportedLibraryScoreFile(source.fileName)) return failed(source.fileName, "UNSUPPORTED_FORMAT");
    const probe = await probeScoreFormat(source.fileName, bytes);
    if (probe.status === "unsupported") return failed(source.fileName, "UNSUPPORTED_FORMAT");
    if (probe.status !== "confirmed") return failed(source.fileName, "INVALID_SCORE");
    const scoreIdentity = await createContentHash(bytes);
    const present = await repository.findByIdentity(scoreIdentity);
    if (present) return { status: "existing", score: present };
    const adapter = adapters.find((item) => item.format === probe.format);
    if (!adapter) return failed(source.fileName, "UNSUPPORTED_FORMAT");
    const parsed = await adapter.parse({
      fileName: source.fileName,
      bytes,
      ...(signal === undefined ? {} : { signal }),
    });
    if (!parsed.capabilities.view || parsed.document.tracks.length === 0 || parsed.document.summary.trackCount === 0) {
      return failed(source.fileName, "INVALID_SCORE");
    }
    if (signal?.aborted) return undefined;
    const draft: ValidatedLibraryScoreDraft = {
      id: crypto.randomUUID(),
      scoreIdentity,
      file: { fileName: source.fileName, bytes },
      format: probe.format,
      parsedTitle: parsed.document.summary.title,
      importedAt: new Date().toISOString(),
      ...(parsed.document.summary.durationMs === undefined ? {} : { durationMs: parsed.document.summary.durationMs }),
    };
    return repository.add(draft);
  } catch (error) {
    return failed(source.fileName, classify(error));
  }
}

function failed(fileName: string, code: LibraryImportError["code"]): ImportItemResult {
  return { status: "failed", fileName, error: { code } };
}

function classify(error: unknown): LibraryImportError["code"] {
  if (error instanceof DOMException && error.name === "QuotaExceededError") return "STORAGE_QUOTA_EXCEEDED";
  if (error instanceof DOMException || error instanceof TypeError) return "READ_FAILED";
  return "UNKNOWN";
}
