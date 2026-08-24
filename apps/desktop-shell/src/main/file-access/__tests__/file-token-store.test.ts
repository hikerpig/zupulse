import { describe, expect, it } from "vitest";
import { FileTokenStore } from "../file-token-store";

describe("FileTokenStore", () => {
  it("consumes a token exactly once", () => {
    const store = new FileTokenStore({ now: () => 1000, ttlMs: 60_000 });
    const token = store.issue("/tmp/song.gp5", { fileName: "song.gp5", sizeBytes: 12 });
    expect(store.consume(token).fileName).toBe("song.gp5");
    expect(() => store.consume(token)).toThrow("FILE_TOKEN_INVALID");
  });

  it("rejects an expired token and clears all outstanding tokens", () => {
    let now = 1000;
    const store = new FileTokenStore({ now: () => now, ttlMs: 60_000 });
    const expired = store.issue("/tmp/old.gp5", { fileName: "old.gp5", sizeBytes: 12 });
    now = 61_001;
    expect(() => store.consume(expired)).toThrow("FILE_TOKEN_INVALID");

    const cleared = store.issue("/tmp/new.gp5", { fileName: "new.gp5", sizeBytes: 12 });
    store.clear();
    expect(() => store.consume(cleared)).toThrow("FILE_TOKEN_INVALID");
  });

  it("peeks a token without consuming it", () => {
    const store = new FileTokenStore({ now: () => 1000, ttlMs: 60_000 });
    const token = store.issue("/tmp/score.pdf", { fileName: "score.pdf", sizeBytes: 42 });
    expect(store.peek(token).fileName).toBe("score.pdf");
    expect(store.peek(token).fileName).toBe("score.pdf");
    expect(store.consume(token).fileName).toBe("score.pdf");
    expect(() => store.peek(token)).toThrow("FILE_TOKEN_INVALID");
  });

  it("rejects peeking an expired token and honors a per-token TTL", () => {
    let now = 1000;
    const store = new FileTokenStore({ now: () => now, ttlMs: 60_000 });
    const longLived = store.issue("/tmp/score.pdf", { fileName: "score.pdf", sizeBytes: 42 }, 30 * 60_000);
    now = 61_001;
    expect(store.peek(longLived).fileName).toBe("score.pdf");
    now = 1000 + 30 * 60_000 + 1;
    expect(() => store.peek(longLived)).toThrow("FILE_TOKEN_INVALID");
  });
});
