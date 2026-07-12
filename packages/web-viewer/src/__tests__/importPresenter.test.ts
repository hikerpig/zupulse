// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { presentScoreFile } from "../importPresenter";

describe("presentScoreFile", () => {
  it("rejects unsupported contents independently of extension", async () => {
    const state = await presentScoreFile({
      file: {
        name: "fake.musicxml",
        async arrayBuffer() {
          return new TextEncoder().encode("not music").buffer;
        },
      },
      api: { settings: {}, load: vi.fn() } as never,
    });
    expect(state.status).toBe("error");
  });
});
