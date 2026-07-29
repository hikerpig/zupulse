// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button, IconButton } from "../button";

afterEach(cleanup);

describe("Button", () => {
  it("forwards its native element ref for overlay anchors", () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Button ref={ref}>Language</Button>);

    expect(ref.current).toBe(screen.getByRole("button", { name: "Language" }));
  });

  it("disables interaction and exposes loading state", () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("exposes toggle state with aria-pressed", () => {
    render(<Button pressed>Loop</Button>);

    expect(screen.getByRole("button", { name: "Loop", pressed: true }).getAttribute("aria-pressed")).toBe("true");
  });
});

describe("IconButton", () => {
  it("requires and exposes an accessible name without rendering extra copy", () => {
    render(
      <IconButton aria-label="Settings">
        <svg aria-hidden="true" />
      </IconButton>,
    );

    const button = screen.getByRole("button", { name: "Settings" });
    expect(button.getAttribute("aria-label")).toBe("Settings");
    expect(button.hasAttribute("data-icon-button")).toBe(true);
  });
});
