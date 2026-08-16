import { describe, expect, it } from "vitest";
import { runPdfOmrCommand } from "../command";

describe("pdf OMR CLI", () => {
  it("returns help without loading an OMR engine", async () => {
    await expect(runPdfOmrCommand(["--help"])).resolves.toEqual({
      schemaVersion: "1.0.0",
      command: "help",
      usage: expect.stringMatching(/pdf-omr[\s\S]+audiveris\|legato\|rokot[\s\S]+compare-engines/),
    });
  });

  it("validates cross-engine comparison arguments before reading run artifacts", async () => {
    await expect(
      runPdfOmrCommand(["compare-engines", "--primary", "primary", "--output", "comparison"]),
    ).rejects.toMatchObject({
      code: "INVALID_CLI_ARGUMENT",
      context: { command: "compare-engines" },
    });
  });

  it("accepts pnpm's argument separator", async () => {
    await expect(runPdfOmrCommand(["--", "--help"])).resolves.toMatchObject({
      schemaVersion: "1.0.0",
      command: "help",
    });
  });

  it("validates Rokot-only staff layout arguments before recognition", async () => {
    await expect(
      runPdfOmrCommand(["recognize", "score.pdf", "--engine", "rokot", "--output", "run", "--staff-layout", "mixed"]),
    ).rejects.toMatchObject({
      code: "INVALID_CLI_ARGUMENT",
      context: { command: "recognize", staffLayout: "mixed" },
    });
    await expect(
      runPdfOmrCommand([
        "recognize",
        "score.pdf",
        "--engine",
        "audiveris",
        "--output",
        "run",
        "--staff-layout",
        "single-staff",
      ]),
    ).rejects.toMatchObject({
      code: "INVALID_CLI_ARGUMENT",
      context: { command: "recognize", engineId: "audiveris" },
    });
    await expect(
      runPdfOmrCommand([
        "recognize",
        "score.pdf",
        "--engine",
        "rokot",
        "--output",
        "run",
        "--input-scope",
        "page-fragment",
      ]),
    ).rejects.toMatchObject({
      code: "INVALID_CLI_ARGUMENT",
      context: { command: "recognize", inputScope: "page-fragment" },
    });
  });
});
