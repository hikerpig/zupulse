// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { Toolbar } from "../toolbar";

afterEach(cleanup);

describe("Toolbar", () => {
  it("moves horizontal focus between enabled controls and wraps", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Toolbar aria-label="History">
          <button type="button">Undo</button>
          <button type="button" disabled>
            Unavailable
          </button>
          <button type="button">Redo</button>
        </Toolbar>
        <button type="button">After toolbar</button>
      </>,
    );

    expect(screen.getByRole("toolbar", { name: "History" }).getAttribute("aria-orientation")).toBe("horizontal");

    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Undo" }));
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Redo" }));
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Undo" }));
    await user.keyboard("{ArrowLeft}");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Redo" }));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "After toolbar" }));
  });

  it("supports Home and End within a vertical toolbar", async () => {
    const user = userEvent.setup();
    render(
      <Toolbar aria-label="Arrange" orientation="vertical">
        <button type="button">Top</button>
        <button type="button">Middle</button>
        <button type="button">Bottom</button>
      </Toolbar>,
    );

    const toolbar = screen.getByRole("toolbar", { name: "Arrange" });
    expect(toolbar.getAttribute("aria-orientation")).toBe("vertical");

    await user.tab();
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Middle" }));
    await user.keyboard("{End}");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Bottom" }));
    await user.keyboard("{Home}");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Top" }));
  });

  it("does not intercept arrow keys from text inputs", async () => {
    const user = userEvent.setup();
    render(
      <Toolbar aria-label="Parameters">
        <input aria-label="Tempo" defaultValue="120" />
        <button type="button">Reset</button>
      </Toolbar>,
    );

    await user.tab();
    await user.keyboard("{ArrowRight}");

    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Tempo" }));
  });
});
