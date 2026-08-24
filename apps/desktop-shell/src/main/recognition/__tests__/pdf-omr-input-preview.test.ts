import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { encodeRgbaPng, readPdfPageCount, renderPdfPages } from "@zupulse/pdf-omr-cli/pipeline";
import { FileTokenStore } from "../../file-access/file-token-store";
import { readPdfOmrInputPreview, type PdfOmrInputPreviewCache } from "../pdf-omr-input-preview";

vi.mock("@zupulse/pdf-omr-cli/pipeline", () => ({
  readPdfPageCount: vi.fn(async () => 2),
  renderPdfPages: vi.fn(async () => [{ pixelWidth: 2, pixelHeight: 1, pixels: new Uint8Array(8) }]),
  encodeRgbaPng: vi.fn(() => new Uint8Array([137, 80, 78, 71])),
}));

const temporaryDirectories: string[] = [];
const runtime = {
  pdfjsAssetDirectories: () => ({ standardFontDirectory: "/fonts", wasmDirectory: "/wasm" }),
};

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function stageFile(fileName: string, bytes: Uint8Array): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "zupulse-omr-preview-"));
  temporaryDirectories.push(directory);
  const filePath = path.join(directory, fileName);
  await writeFile(filePath, bytes);
  return filePath;
}

function createCache(): PdfOmrInputPreviewCache {
  return new Map();
}

describe("readPdfOmrInputPreview", () => {
  it("previews a selected image through a token without consuming it", async () => {
    const filePath = await stageFile("score.jpg", new Uint8Array([1, 2, 3]));
    const fileTokens = new FileTokenStore();
    const token = fileTokens.issue(filePath, { fileName: "score.jpg", sizeBytes: 3 });

    const preview = await readPdfOmrInputPreview({
      controller: { getJobInput: () => undefined },
      runtime,
      fileTokens,
      cache: createCache(),
      fileToken: token,
      pageIndex: 0,
    });

    expect(preview).toEqual({
      status: "available",
      pageIndex: 0,
      pageCount: 1,
      contentType: "image/jpeg",
      bytes: new Uint8Array([1, 2, 3]),
    });
    expect(fileTokens.consume(token).fileName).toBe("score.jpg");
  });

  it("reports unavailable for unknown or expired tokens", async () => {
    let now = 1000;
    const fileTokens = new FileTokenStore({ now: () => now, ttlMs: 1000 });
    const expired = fileTokens.issue("/tmp/score.pdf", { fileName: "score.pdf", sizeBytes: 3 });
    now = 2001;
    const controller = { getJobInput: () => undefined };

    await expect(
      readPdfOmrInputPreview({
        controller,
        runtime,
        fileTokens,
        cache: createCache(),
        fileToken: expired,
        pageIndex: 0,
      }),
    ).resolves.toEqual({ status: "unavailable" });
    await expect(
      readPdfOmrInputPreview({
        controller,
        runtime,
        fileTokens,
        cache: createCache(),
        fileToken: "missing",
        pageIndex: 0,
      }),
    ).resolves.toEqual({ status: "unavailable" });
  });

  it("previews a job's materialized image input and rejects later pages", async () => {
    const filePath = await stageFile("score.png", new Uint8Array([4, 5]));
    const controller = {
      getJobInput: (jobId: string) =>
        jobId === "job-1"
          ? {
              inputPath: filePath,
              fileName: "score.png",
              sizeBytes: 2,
              inputKind: "image" as const,
              engineId: "audiveris",
              outputDirectory: "/tmp/out",
            }
          : undefined,
    };

    const preview = await readPdfOmrInputPreview({
      controller,
      runtime,
      fileTokens: new FileTokenStore(),
      cache: createCache(),
      jobId: "job-1",
      pageIndex: 0,
    });
    expect(preview).toMatchObject({ status: "available", contentType: "image/png", pageCount: 1 });

    await expect(
      readPdfOmrInputPreview({
        controller,
        runtime,
        fileTokens: new FileTokenStore(),
        cache: createCache(),
        jobId: "job-1",
        pageIndex: 1,
      }),
    ).resolves.toEqual({ status: "unavailable" });
    await expect(
      readPdfOmrInputPreview({
        controller,
        runtime,
        fileTokens: new FileTokenStore(),
        cache: createCache(),
        jobId: "job-2",
        pageIndex: 0,
      }),
    ).resolves.toEqual({ status: "unavailable" });
  });

  it("renders and caches PDF pages for a selected token", async () => {
    const filePath = await stageFile("score.pdf", new Uint8Array([37, 80, 68, 70]));
    const fileTokens = new FileTokenStore();
    const token = fileTokens.issue(filePath, { fileName: "score.pdf", sizeBytes: 4 });
    const cache = createCache();
    const controller = { getJobInput: () => undefined };

    const first = await readPdfOmrInputPreview({
      controller,
      runtime,
      fileTokens,
      cache,
      fileToken: token,
      pageIndex: 0,
    });
    expect(first).toEqual({
      status: "available",
      pageIndex: 0,
      pageCount: 2,
      contentType: "image/png",
      bytes: new Uint8Array([137, 80, 78, 71]),
    });
    expect(vi.mocked(renderPdfPages)).toHaveBeenCalledTimes(1);

    await readPdfOmrInputPreview({ controller, runtime, fileTokens, cache, fileToken: token, pageIndex: 0 });
    expect(vi.mocked(renderPdfPages)).toHaveBeenCalledTimes(1);

    await readPdfOmrInputPreview({ controller, runtime, fileTokens, cache, fileToken: token, pageIndex: 1 });
    expect(vi.mocked(renderPdfPages)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(encodeRgbaPng)).toHaveBeenCalled();
    expect(vi.mocked(readPdfPageCount)).toHaveBeenCalled();
  });
});
