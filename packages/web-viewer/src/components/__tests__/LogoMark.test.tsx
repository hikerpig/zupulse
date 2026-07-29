// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LogoMark } from "../LogoMark";

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.theme;
});

describe("LogoMark", () => {
  it("renders the complete light and dark artwork for CSS theme switching", () => {
    render(<LogoMark size={32} />);

    const mark = screen.getByTestId("zupulse-logo-mark");
    expect(mark).toBeTruthy();
    expect(mark.getAttribute("aria-hidden")).toBe("true");

    const variants = mark.querySelectorAll("svg");
    expect(variants).toHaveLength(2);
    for (const [svg, stroke] of [
      [variants[0], "#141414"],
      [variants[1], "#e0dbd5"],
    ] as const) {
      expect(svg?.getAttribute("viewBox")).toBe("0 0 128 128");
      expect(svg?.querySelector("rect")).toBeNull();
      expect(svg?.querySelector("g")?.getAttribute("stroke")).toBe(stroke);
      expect(svg?.querySelector("g")?.getAttribute("fill")).toBe("none");
      expect(svg?.querySelectorAll("g")[1]?.getAttribute("fill")).toBe("#f26b4f");
      expect(svg?.querySelectorAll("circle")).toHaveLength(5);
    }
  });
});
