import { describe, expect, it } from "vitest";
import { initialSurfaceForHash } from "../initial-surface";

describe("initialSurfaceForHash", () => {
  it("maps library routes to the library surface", () => {
    expect(initialSurfaceForHash("")).toBe("library");
    expect(initialSurfaceForHash("#")).toBe("library");
    expect(initialSurfaceForHash("#/")).toBe("library");
    expect(initialSurfaceForHash("#/library")).toBe("library");
    expect(initialSurfaceForHash("#/library?sort=recent")).toBe("library");
  });

  it("maps score routes to their surfaces", () => {
    expect(initialSurfaceForHash("#/viewer/abc-123")).toBe("viewer");
    expect(initialSurfaceForHash("#/studio/abc-123")).toBe("studio");
  });

  it("reports unknown routes as not-found", () => {
    expect(initialSurfaceForHash("#/settings")).toBe("not-found");
    expect(initialSurfaceForHash("#/missing")).toBe("not-found");
  });
});
