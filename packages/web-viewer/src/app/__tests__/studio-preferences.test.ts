import { describe, expect, it } from "vitest";
import { loadStudioPreferences, saveStudioPreferences } from "../studio-preferences";

function storage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe("Studio preferences", () => {
  it("uses safe defaults for missing, malformed, and out-of-range stored values", () => {
    expect(loadStudioPreferences(storage())).toEqual({ split: 40, previewEnabled: true });
    expect(loadStudioPreferences(storage({ "zupulse.studio.preferences": "not-json" }))).toEqual({
      split: 40,
      previewEnabled: true,
    });
    expect(
      loadStudioPreferences(
        storage({ "zupulse.studio.preferences": JSON.stringify({ version: 1, split: 5, previewEnabled: false }) }),
      ),
    ).toEqual({ split: 40, previewEnabled: true });
  });

  it("persists only the versioned device preferences", () => {
    const target = storage();
    saveStudioPreferences(target, { split: 67, previewEnabled: false });
    expect(target.getItem("zupulse.studio.preferences")).toBe(
      JSON.stringify({ version: 1, split: 67, previewEnabled: false }),
    );
    expect(loadStudioPreferences(target)).toEqual({ split: 67, previewEnabled: false });
  });

  it("does not let unavailable storage affect the workspace", () => {
    const unavailable = {
      getItem: () => {
        throw new DOMException("denied", "SecurityError");
      },
      setItem: () => {
        throw new DOMException("denied", "SecurityError");
      },
    };
    expect(loadStudioPreferences(unavailable)).toEqual({ split: 40, previewEnabled: true });
    expect(() => saveStudioPreferences(unavailable, { split: 60, previewEnabled: true })).not.toThrow();
  });
});
