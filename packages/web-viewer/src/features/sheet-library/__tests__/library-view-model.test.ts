import { describe, expect, it } from "vitest";
import type { LibraryScoreSummary } from "@zupulse/web-core";
import {
  filterAndSortLibraryScores,
  formatDuration,
  formatRelativeDate,
  getLibraryStats,
} from "../model/library-view-model";

describe("library view model", () => {
  it("filters favorites and title or artist queries before sorting", () => {
    const older = score({ id: "older", title: "Nocturne", artist: "Chopin", isFavorite: true });
    const newer = score({
      id: "newer",
      title: "Prelude",
      artist: "Debussy",
      isFavorite: false,
      importedAt: "2026-07-25T00:00:00.000Z",
    });

    expect(
      filterAndSortLibraryScores({
        scores: [older, newer],
        favoritesOnly: true,
        normalizedQuery: "chopin",
        sort: "activity",
        locale: "en",
      }),
    ).toEqual([older]);
    expect(
      filterAndSortLibraryScores({
        scores: [older, newer],
        favoritesOnly: false,
        normalizedQuery: "",
        sort: "imported",
        locale: "en",
      }),
    ).toEqual([newer, older]);
  });

  it("derives loop and practice stats without mutating score facts", () => {
    const scores = [
      score({ id: "first", practice: { hasLoop: true, lastPracticedAt: "2026-07-20T00:00:00.000Z" } }),
      score({ id: "second", practice: { hasLoop: false, lastPracticedAt: "2026-07-22T00:00:00.000Z" } }),
    ];

    expect(getLibraryStats(scores)).toEqual({
      total: 2,
      withLoop: 1,
      lastPracticedAt: "2026-07-22T00:00:00.000Z",
    });
  });

  it("formats durations and relative dates at the presentation boundary", () => {
    const now = new Date("2026-07-24T12:00:00.000Z");
    expect(formatDuration(61_400)).toBe("1:01");
    expect(formatRelativeDate("2026-07-24T01:00:00.000Z", "en", { today: "today", yesterday: "yesterday" }, now)).toBe(
      "today",
    );
    expect(formatRelativeDate("2026-07-23T01:00:00.000Z", "en", { today: "today", yesterday: "yesterday" }, now)).toBe(
      "yesterday",
    );
  });
});

function score(overrides: Partial<LibraryScoreSummary>): LibraryScoreSummary {
  return {
    id: "score",
    scoreIdentity: "a".repeat(64),
    fileName: "score.gp",
    format: "gp",
    title: "Score",
    importedAt: "2026-07-24T00:00:00.000Z",
    isFavorite: false,
    practice: { hasLoop: false },
    metadata: {},
    ...overrides,
  };
}
