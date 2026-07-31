import type { LibraryScoreSummary } from "@zupulse/web-core";

export type LibrarySort = "activity" | "imported" | "practiced" | "title";

export type LibraryStats = {
  total: number;
  withLoop: number;
  lastPracticedAt: string | undefined;
};

export function filterAndSortLibraryScores({
  scores,
  favoritesOnly,
  normalizedQuery,
  sort,
  locale,
}: {
  scores: readonly LibraryScoreSummary[];
  favoritesOnly: boolean;
  normalizedQuery: string;
  sort: LibrarySort;
  locale: string;
}): LibraryScoreSummary[] {
  const lowerQuery = normalizedQuery.toLocaleLowerCase();
  return scores
    .filter((score) => !favoritesOnly || score.isFavorite)
    .filter((score) => `${score.title} ${score.artist ?? ""}`.toLocaleLowerCase().includes(lowerQuery))
    .sort((left, right) =>
      sort === "title"
        ? left.title.localeCompare(right.title, locale)
        : scoreSortTime(left, sort) - scoreSortTime(right, sort),
    )
    .reverse();
}

export function getLibraryStats(scores: readonly LibraryScoreSummary[]): LibraryStats {
  const lastPracticedAt = scores
    .map((score) => score.practice.lastPracticedAt)
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0];

  return {
    total: scores.length,
    withLoop: scores.filter((score) => score.practice.hasLoop).length,
    lastPracticedAt,
  };
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function formatRelativeDate(
  iso: string,
  locale: string,
  labels: { today: string; yesterday: string },
  now = new Date(),
): string {
  const date = new Date(iso);
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return labels.today;
  if (diffDays === 1) return labels.yesterday;
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "always" });
  if (diffDays < 7) return formatter.format(-diffDays, "day");
  if (diffDays < 30) return formatter.format(-Math.floor(diffDays / 7), "week");
  return formatter.format(-Math.floor(diffDays / 30), "month");
}

function scoreSortTime(score: LibraryScoreSummary, sort: Exclude<LibrarySort, "title">): number {
  const value =
    sort === "imported"
      ? score.importedAt
      : sort === "practiced"
        ? (score.practice.lastPracticedAt ?? "1970-01-01T00:00:00.000Z")
        : (score.lastOpenedAt ?? score.importedAt);
  return Date.parse(value);
}
