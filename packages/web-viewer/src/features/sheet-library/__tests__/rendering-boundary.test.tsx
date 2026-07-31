// @vitest-environment jsdom

import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { LibraryScoreSummary } from "@zupulse/web-core";
import type { ViewerApplication } from "../../../app/ViewerApplication";
import { LibraryScoreList } from "../components/library-score-list";
import { getLibraryStats } from "../model/library-view-model";

const rowRender = vi.hoisted(() => vi.fn());

vi.mock("../components/library-score-row", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  return {
    LibraryScoreRow: () => {
      rowRender();
      return React.createElement("li", { "data-testid": "score-row" });
    },
  };
});

describe("Library rendering boundary", () => {
  it("does not rerender the memoized score list while an immediate search value changes", async () => {
    const scores = [score()];

    function Harness() {
      const [query, setQuery] = useState("");
      return (
        <>
          <label>
            Search
            <input value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <LibraryScoreList
            application={application}
            scores={scores}
            stats={stats}
            isFiltering={false}
            normalizedQuery=""
            locale="en"
            actionsReturnFocusRef={focusRef}
            onOpen={onOpen}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        </>
      );
    }

    render(<Harness />);
    await userEvent.type(screen.getByRole("textbox", { name: "Search" }), "abc");

    expect(rowRender).toHaveBeenCalledOnce();
  });
});

const application = {
  setFavorite: vi.fn(async () => undefined),
  refreshLibrary: vi.fn(async () => undefined),
  exportLibraryScore: vi.fn(async () => undefined),
} as unknown as ViewerApplication;
const stats = getLibraryStats([score()]);
const focusRef = { current: null };
const onOpen = vi.fn();
const onEdit = vi.fn();
const onDelete = vi.fn();

function score(): LibraryScoreSummary {
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
  };
}
