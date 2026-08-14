import { describe, expect, it } from "vitest";
import { FileTokenStore } from "../fileTokens";
import { selectMidiFile, selectPdfFile } from "../files";

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
