import { describe, expect, it } from "vitest";
import { runPdfOmrCommand } from "../command";
import type { EngineRegistry } from "../engine-registry";

const unusedRokotRegistry: EngineRegistry = {
  get() {
    return {
      inspectEnvironment: async () => {
        throw new Error("unused");
      },
      recognize: async () => {
        throw new Error("unused");
      },
      normalize: () => {
        throw new Error("unused");
      },
    };
  },
};

describe("pdf OMR CLI", () => {
  it("returns help without loading an OMR engine", async () => {
    await expect(runPdfOmrCommand(["--help"])).resolves.toEqual({
      schemaVersion: "1.0.0",
      command: "help",
      usage: expect.stringMatching(
        /pdf-omr[\s\S]+audiveris\|legato\|rokot[\s\S]+compare-engines[\s\S]+evaluate-repair-candidates/,
      ),
    });
  });

  it("validates cross-engine comparison arguments before reading run artifacts", async () => {
    await expect(
      runPdfOmrCommand(["compare-engines", "--primary", "primary", "--output", "comparison"]),
    ).rejects.toMatchObject({
      code: "INVALID_CLI_ARGUMENT",
      context: { command: "compare-engines" },
    });
    await expect(
      runPdfOmrCommand([
        "compare-engines",
        "--primary",
        "primary",
        "--secondary",
        "secondary",
        "--output",
        "comparison",
        "--topology",
        "guessed",
      ]),
    ).rejects.toMatchObject({
      code: "INVALID_CLI_ARGUMENT",
      context: { command: "compare-engines", topologyMode: "guessed" },
    });
  });

  it("validates repair candidate evaluation arguments before reading artifacts", async () => {
    await expect(
      runPdfOmrCommand(["evaluate-repair-candidates", "--comparison", "comparison", "--output", "evaluation"]),
    ).rejects.toMatchObject({
      code: "INVALID_CLI_ARGUMENT",
      context: { command: "evaluate-repair-candidates" },
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

  it("accepts an explicit three-staff system crop for Rokot", async () => {
    await expect(
      runPdfOmrCommand(
        [
          "recognize",
          "missing.pdf",
          "--engine",
          "rokot",
          "--output",
          "run",
          "--input-scope",
          "system-crop",
          "--staff-layout",
          "three-staff",
        ],
        { engineRegistry: unusedRokotRegistry },
      ),
    ).rejects.toMatchObject({ code: "INVALID_INPUT", context: { reason: "unreadable-input" } });
  });

  it("accepts piano-grand-staff-v1 before reading the input and rejects conflicts", async () => {
    await expect(
      runPdfOmrCommand(
        ["recognize", "missing.pdf", "--engine", "rokot", "--output", "run", "--segmentation", "piano-grand-staff-v1"],
        { engineRegistry: unusedRokotRegistry },
      ),
    ).rejects.toMatchObject({ code: "INVALID_INPUT", context: { reason: "unreadable-input" } });
    await expect(
      runPdfOmrCommand(
        [
          "recognize",
          "missing.pdf",
          "--engine",
          "rokot",
          "--output",
          "run",
          "--segmentation",
          "piano-grand-staff-v1",
          "--staff-layout",
          "grand-staff",
        ],
        { engineRegistry: unusedRokotRegistry },
      ),
    ).rejects.toMatchObject({ code: "INVALID_INPUT", context: { reason: "unreadable-input" } });
    await expect(
      runPdfOmrCommand([
        "recognize",
        "score.pdf",
        "--engine",
        "rokot",
        "--output",
        "run",
        "--segmentation",
        "learned-staff-system-v1",
      ]),
    ).rejects.toMatchObject({
      code: "INVALID_CLI_ARGUMENT",
      context: { command: "recognize", segmentationId: "learned-staff-system-v1" },
    });
    await expect(
      runPdfOmrCommand([
        "recognize",
        "score.pdf",
        "--engine",
        "rokot",
        "--output",
        "run",
        "--segmentation",
        "piano-grand-staff-v1",
        "--staff-layout",
        "auto",
      ]),
    ).rejects.toMatchObject({
      code: "INVALID_CLI_ARGUMENT",
      context: { command: "recognize", segmentationId: "piano-grand-staff-v1", staffLayout: "auto" },
    });
    await expect(
      runPdfOmrCommand([
        "recognize",
        "score.pdf",
        "--engine",
        "audiveris",
        "--output",
        "run",
        "--segmentation",
        "piano-grand-staff-v1",
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
        "system-crop",
        "--segmentation",
        "piano-grand-staff-v1",
      ]),
    ).rejects.toMatchObject({
      code: "INVALID_CLI_ARGUMENT",
      context: { command: "recognize", inputScope: "system-crop", segmentationId: "piano-grand-staff-v1" },
    });
  });
});
