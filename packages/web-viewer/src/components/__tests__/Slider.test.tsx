// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

  it("keeps the interaction preview stable while external playback values lag behind", () => {
    const onValueCommitted = vi.fn();
    const { rerender } = render(<Slider label="播放进度" max={1000} value={100} onValueCommitted={onValueCommitted} />);
    const slider = screen.getByRole("slider", { name: "播放进度" });

    fireEvent.change(slider, { target: { value: "700" } });
    expect(slider.getAttribute("aria-valuenow")).toBe("700");
    rerender(<Slider label="播放进度" max={1000} value={120} onValueCommitted={onValueCommitted} />);
    expect(slider.getAttribute("aria-valuenow")).toBe("700");

    expect(onValueCommitted).toHaveBeenLastCalledWith(700);
  });
});
