import { mkdtemp, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FileTokenStore } from "../file-token-store";
import { materializePdfOmrInput, selectMidiFile, selectPdfFile } from "../score-files";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("selectPdfFile", () => {
  it("accepts one PDF and returns a one-time token without its path", async () => {
    const tokens = new FileTokenStore({ now: () => 100, ttlMs: 1000 });
    const result = await selectPdfFile(tokens, {
      showOpenDialog: async () => ({ canceled: false, filePaths: ["/private/score.pdf"] }),
      stat: async () => ({ size: 42, isFile: () => true }),
    });

    expect(result).toEqual({
      status: "selected",
      fileToken: expect.any(String),
      fileName: "score.pdf",
      sizeBytes: 42,
      inputKind: "pdf",
    });
    expect(JSON.stringify(result)).not.toContain("/private/");
  });

  it.each(["score.png", "score.jpg", "score.jpeg"])("accepts image input %s", async (fileName) => {
    const tokens = new FileTokenStore();
    await expect(
      selectPdfFile(tokens, {
        showOpenDialog: async () => ({ canceled: false, filePaths: [`/private/${fileName}`] }),
        stat: async () => ({ size: 42, isFile: () => true }),
      }),
    ).resolves.toMatchObject({ status: "selected", fileName, inputKind: "image" });
  });

  it("rejects non-PDF selections without issuing a token", async () => {
    const tokens = new FileTokenStore();
    await expect(
      selectPdfFile(tokens, {
        showOpenDialog: async () => ({ canceled: false, filePaths: ["/private/score.musicxml"] }),
        stat: async () => ({ size: 42, isFile: () => true }),
      }),
    ).resolves.toEqual({ status: "cancelled" });
  });
});

describe("selectMidiFile", () => {
  it("accepts MIDI without exposing its path and rejects unrelated files", async () => {
    const tokens = new FileTokenStore();
    await expect(
      selectMidiFile(tokens, {
        showOpenDialog: async () => ({ canceled: false, filePaths: ["/private/reference.mid"] }),
        stat: async () => ({ size: 84, isFile: () => true }),
      }),
    ).resolves.toEqual({
      status: "selected",
      fileToken: expect.any(String),
      fileName: "reference.mid",
      sizeBytes: 84,
    });
    await expect(
      selectMidiFile(tokens, {
        showOpenDialog: async () => ({ canceled: false, filePaths: ["/private/reference.pdf"] }),
        stat: async () => ({ size: 84, isFile: () => true }),
      }),
    ).resolves.toEqual({ status: "cancelled" });
  });
});

describe("materializePdfOmrInput", () => {
  it("rejects a selected file whose identity changed before start", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "zupulse-pdf-input-"));
    temporaryDirectories.push(directory);
    const source = path.join(directory, "score.pdf");
    await writeFile(source, "first");
    const first = await stat(source);
    const tokens = new FileTokenStore();
    const token = tokens.issue(source, {
      fileName: "score.pdf",
      sizeBytes: first.size,
      identity: { dev: first.dev, ino: first.ino, mtimeMs: first.mtimeMs },
    });
    await rm(source);
    await writeFile(source, "other");
    await utimes(source, new Date(0), new Date(0));

    await expect(materializePdfOmrInput(tokens, token, path.join(directory, "run"))).rejects.toThrow("FILE_CHANGED");
  });

  it("copies a validated input so later source changes cannot affect retries", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "zupulse-pdf-input-"));
    temporaryDirectories.push(directory);
    const source = path.join(directory, "score.pdf");
    await writeFile(source, "stable");
    const info = await stat(source);
    const tokens = new FileTokenStore();
    const token = tokens.issue(source, {
      fileName: "score.pdf",
      sizeBytes: info.size,
      identity: { dev: info.dev, ino: info.ino, mtimeMs: info.mtimeMs },
    });

    const materialized = await materializePdfOmrInput(tokens, token, path.join(directory, "run"));
    await writeFile(source, "changed");

    await expect(readFile(materialized.path, "utf8")).resolves.toBe("stable");
  });
});
