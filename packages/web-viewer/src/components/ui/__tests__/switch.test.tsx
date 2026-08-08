// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Switch } from "../switch";

afterEach(cleanup);

describe("Switch", () => {
  it("exposes its checked state and emits the next value", () => {
    const onCheckedChange = vi.fn();
    render(
      <label>
        <span>Chord preview</span>
        <Switch checked onCheckedChange={onCheckedChange} />
      </label>,
    );

    const control = screen.getByRole("switch", { name: "Chord preview" });
    expect(control.getAttribute("aria-checked")).toBe("true");

    fireEvent.click(control);

    expect(onCheckedChange).toHaveBeenCalledWith(false, expect.anything());
  });
});
