import { describe, expect, it } from "vitest";
import { runPdfOmrCommand } from "../command";

describe("pdf OMR CLI", () => {
  it("returns help without loading an OMR engine", async () => {
    await expect(runPdfOmrCommand(["--help"])).resolves.toEqual({
      schemaVersion: "1.0.0",
      command: "help",
      usage: expect.stringContaining("pdf-omr"),
    });
  });

  it("accepts pnpm's argument separator", async () => {
    await expect(runPdfOmrCommand(["--", "--help"])).resolves.toMatchObject({
      schemaVersion: "1.0.0",
      command: "help",
    });
  });
});
