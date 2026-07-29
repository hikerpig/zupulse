// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Panel, Status } from "../surface";

afterEach(cleanup);

describe("Panel", () => {
  it("exposes a named structural region without changing its content hierarchy", () => {
    render(
      <Panel aria-label="Loop controls">
        <h2>Loop</h2>
        <p>Measures 4–8</p>
      </Panel>,
    );

    const panel = screen.getByRole("region", { name: "Loop controls" });
    expect(panel.querySelector("h2")?.textContent).toBe("Loop");
    expect(panel.textContent).toContain("Measures 4–8");
  });
});

describe("Status", () => {
  it("renders every tone with text and a non-textual marker", () => {
    const variants = [
      ["ready", "Ready"],
      ["warning", "Needs review"],
      ["danger", "Failed"],
      ["neutral", "Not analyzed"],
    ] as const;
    render(
      <>
        {variants.map(([tone, label]) => (
          <Status key={tone} tone={tone}>
            {label}
          </Status>
        ))}
      </>,
    );

    for (const [tone, label] of variants) {
      const status = screen.getByText(label);
      expect(status.textContent).toBe(label);
      expect(status.getAttribute("data-tone")).toBe(tone);
      expect(status.querySelector('[aria-hidden="true"]')).not.toBeNull();
    }
  });
});
