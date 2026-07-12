// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Slider } from "../Slider";

afterEach(cleanup);

describe("Slider", () => {
  it("exposes an accessible range and commits keyboard changes", async () => {
    const onValueChange = vi.fn();
    render(<Slider label="速度" min={25} max={200} step={5} value={100} onValueChange={onValueChange} />);

    const slider = screen.getByRole("slider", { name: "速度" });
    slider.focus();
    await userEvent.keyboard("{ArrowRight}");

    expect(onValueChange).toHaveBeenCalledWith(105);
  });
});
