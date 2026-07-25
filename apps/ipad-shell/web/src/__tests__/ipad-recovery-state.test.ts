// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { attachIpadRoutePersistence, restoreIpadRoute } from "../ipad-recovery-state";

const scoreId = "00000000-0000-4000-8000-000000000001";

describe("iPad recovery state", () => {
  afterEach(() => {
    localStorage.clear();
    window.location.hash = "";
  });

  it("restores only a persistent library score id, never transient viewer state", () => {
    window.location.hash = `#/viewer/${scoreId}`;
    const detach = attachIpadRoutePersistence(window);
    window.dispatchEvent(new HashChangeEvent("hashchange"));

    expect(localStorage.getItem("zupulse-ipad-route")).toBe(
      JSON.stringify({ route: "viewer", libraryScoreId: scoreId }),
    );

    window.location.hash = "";
    expect(restoreIpadRoute(window)).toBe(true);
    expect(window.location.hash).toBe(`#/viewer/${scoreId}`);
    detach();
  });

  it("rejects malformed or transient persisted state and falls back to Library", () => {
    localStorage.setItem(
      "zupulse-ipad-route",
      JSON.stringify({ route: "viewer", libraryScoreId: scoreId, sessionId: "transient" }),
    );

    expect(restoreIpadRoute(window)).toBe(false);
    expect(window.location.hash).toBe("");
    expect(localStorage.getItem("zupulse-ipad-route")).toBeNull();
  });

  it("persists Library after a failed restore so reload cannot loop", () => {
    localStorage.setItem("zupulse-ipad-route", JSON.stringify({ route: "viewer", libraryScoreId: scoreId }));
    expect(restoreIpadRoute(window)).toBe(true);

    const detach = attachIpadRoutePersistence(window);
    window.location.hash = "#/";
    window.dispatchEvent(new HashChangeEvent("hashchange"));

    expect(localStorage.getItem("zupulse-ipad-route")).toBe(JSON.stringify({ route: "library" }));
    detach();
  });

  it("observes React Router history navigation without a hashchange event", () => {
    const detach = attachIpadRoutePersistence(window);

    window.history.pushState(null, "", `#/viewer/${scoreId}`);

    expect(localStorage.getItem("zupulse-ipad-route")).toBe(
      JSON.stringify({ route: "viewer", libraryScoreId: scoreId }),
    );
    detach();
  });
});
