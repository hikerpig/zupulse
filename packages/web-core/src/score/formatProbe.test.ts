import { describe, expect, it } from "vitest";
import { probeScoreFormat } from "./formatProbe";

const bytes = (value: string) => new TextEncoder().encode(value);

describe("format probe", () => {
  it("confirms GP and MusicXML from content despite misleading names", async () => {
    await expect(probeScoreFormat("fake.musicxml", bytes("FICHIER GUITAR PRO v5"))).resolves.toMatchObject({
      status: "confirmed",
      format: "gp",
      extensionHint: "musicxml",
    });
    await expect(
      probeScoreFormat("generic.xml", bytes('<score-timewise version="4.0"></score-timewise>')),
    ).resolves.toMatchObject({ status: "confirmed", format: "musicxml" });
  });

  it("confirms legacy GP files with a Pascal-string length prefix", async () => {
    const header = bytes("FICHIER GUITAR PRO v5.10");
    await expect(probeScoreFormat("autumn-leaves.gp5", Uint8Array.of(header.length, ...header))).resolves.toMatchObject(
      { status: "confirmed", format: "gp" },
    );
  });

  it("distinguishes unsupported and malformed input", async () => {
    await expect(probeScoreFormat("notes.xml", bytes("<catalog/>"))).resolves.toMatchObject({ status: "unsupported" });
    await expect(probeScoreFormat("broken.musicxml", bytes("<score-partwise>"))).resolves.toMatchObject({
      status: "malformed",
    });
  });
});
