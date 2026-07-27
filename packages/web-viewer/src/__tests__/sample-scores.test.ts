import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createMusicXmlAdapter } from "@zupulse/web-core";
import { bundledSampleScores, createSampleImportSource } from "../sample-scores";

describe("bundledSampleScores", () => {
  it("creates a normal import source matching the verified release asset", async () => {
    const sample = bundledSampleScores[0]!;
    const bytes = new Uint8Array(await readFile(resolve("product-assets/samples", sample.fileName)));
    const source = createSampleImportSource(sample, async () => bytes);

    expect(source.fileName).toBe(sample.fileName);
    expect(
      createHash("sha256")
        .update(await source.readBytes())
        .digest("hex"),
    ).toBe(sample.sha256);
    await expect(
      createMusicXmlAdapter().parse({ fileName: source.fileName, bytes: await source.readBytes() }),
    ).resolves.toMatchObject({
      document: {
        summary: { trackCount: 1 },
        tracks: [{ name: "Piano", staves: [{}, {}] }],
      },
    });
  });
});
