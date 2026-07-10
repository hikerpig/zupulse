import { describe, expect, it } from "vitest";
import { WEB_CORE_VERSION } from "./index";

describe("web core package", () => {
  it("exposes a stable package version marker", () => {
    expect(WEB_CORE_VERSION).toBe("0.1.0");
  });
});
