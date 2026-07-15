// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";
import { StudioPage } from "../StudioPage";

describe("StudioPage", () => {
  it("renders a persistent library score route without exposing a session id", () => {
    const application = { getSnapshot: () => ({ currentLibraryScoreId: "score-1" }) } as never;
    render(
      <MemoryRouter initialEntries={["/studio/score-1"]}>
        <Routes>
          <Route path="/studio/:libraryScoreId" element={<StudioPage application={application} />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "和弦分析工作室" })).toBeTruthy();
    expect(screen.getByText("Library Score: score-1")).toBeTruthy();
    expect(screen.queryByText(/session/i)).toBeNull();
  });
});
