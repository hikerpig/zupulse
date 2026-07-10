import { describe, expect, it, vi } from "vitest";
import { resolveAppAsset } from "./protocol";

vi.mock("electron", () => ({ net: {}, protocol: {} }));

describe("resolveAppAsset", () => {
  it("resolves assets inside the renderer root", () => {
    expect(resolveAppAsset("/app/renderer", "tab-viewer://app/index.html"))
      .toBe("/app/renderer/index.html");
  });

  it("rejects traversal before URL normalization", () => {
    expect(() => resolveAppAsset("/app/renderer", "tab-viewer://app/%2e%2e/secret"))
      .toThrow("APP_PROTOCOL_PATH_OUTSIDE_ROOT");
  });

  it("rejects invalid origins and malformed escapes", () => {
    expect(() => resolveAppAsset("/app/renderer", "https://example.com/index.html"))
      .toThrow("APP_PROTOCOL_INVALID_ORIGIN");
    expect(() => resolveAppAsset("/app/renderer", "tab-viewer://app/%zz"))
      .toThrow("APP_PROTOCOL_INVALID_PATH");
  });
});
