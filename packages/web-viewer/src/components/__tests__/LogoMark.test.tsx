// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LogoMark } from "../LogoMark";

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.theme;
});

describe("LogoMark", () => {
  it("renders both light and dark variants inlined so the theme can swap them via CSS", () => {
    render(<LogoMark size={32} />);

    const mark = screen.getByTestId("zupulse-logo-mark");
    expect(mark).toBeTruthy();
    expect(mark.getAttribute("aria-hidden")).toBe("true");

    const variants = mark.querySelectorAll("svg");
    expect(variants).toHaveLength(2);
    expect(variants[0]?.getAttribute("viewBox")).toBe("0 0 128 128");
    expect(variants[1]?.getAttribute("viewBox")).toBe("0 0 128 128");
  });

  it("draws the light variant as outline-only on a transparent canvas", () => {
    render(<LogoMark size={32} />);

    const lightSvg = screen.getByTestId("zupulse-logo-mark").querySelectorAll("svg")[0];
    expect(lightSvg?.querySelector("rect")).toBeNull();

    const lightStroke = lightSvg?.querySelector("g");
    expect(lightStroke?.getAttribute("stroke")).toBe("#141414");
    expect(lightStroke?.getAttribute("fill")).toBe("none");

    const dotGroup = lightSvg?.querySelectorAll("g")[1];
    expect(dotGroup?.getAttribute("fill")).toBe("#f26b4f");
    expect(lightSvg?.querySelectorAll("circle")).toHaveLength(5);
  });

  it("draws the dark variant as outline-only on a transparent canvas", () => {
    render(<LogoMark size={32} />);

    const darkSvg = screen.getByTestId("zupulse-logo-mark").querySelectorAll("svg")[1];
    expect(darkSvg?.querySelector("rect")).toBeNull();

    const darkStroke = darkSvg?.querySelector("g");
    expect(darkStroke?.getAttribute("stroke")).toBe("#e0dbd5");
    expect(darkStroke?.getAttribute("fill")).toBe("none");

    const dotGroup = darkSvg?.querySelectorAll("g")[1];
    expect(dotGroup?.getAttribute("fill")).toBe("#f26b4f");
    expect(darkSvg?.querySelectorAll("circle")).toHaveLength(5);
  });
});
