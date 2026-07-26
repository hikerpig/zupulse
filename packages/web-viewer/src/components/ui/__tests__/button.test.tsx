// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button, IconButton } from "../button";

afterEach(cleanup);

describe("Button", () => {
  it("exposes its name and invokes the native button action", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onClick).toHaveBeenCalledOnce();
  });

  it("receives keyboard focus in document order", async () => {
    const user = userEvent.setup();
    render(<Button>Save</Button>);

    await user.tab();

    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Save" }));
  });

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

    expect(screen.getByRole("button", { name: "Settings" }).getAttribute("aria-label")).toBe("Settings");
  });

  it("supports disabled and pressed states", () => {
    render(
      <IconButton aria-label="Mute" disabled pressed>
        <svg aria-hidden="true" />
      </IconButton>,
    );

    const button = screen.getByRole("button", { name: "Mute", pressed: true }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});
