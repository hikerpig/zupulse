// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { afterEach, expect, it } from "vitest";
import { ContextPopup } from "../ContextPopup";

afterEach(cleanup);

it("renders above ancestor stacking contexts through a body portal", () => {
  const anchor = document.createElement("button");
  const { container } = render(
    <div style={{ position: "relative", zIndex: 1 }}>
      <ContextPopup anchor={anchor} open onOpenChange={() => undefined}>
        Popup content
      </ContextPopup>
    </div>,
  );

  const dialog = screen.getByRole("dialog");
  expect(container.contains(dialog)).toBe(false);
  expect(dialog.closest("[data-base-ui-portal]")?.parentElement).toBe(document.body);
});

it("moves focus inside, closes with Escape, and restores focus to its anchor", async () => {
  const user = userEvent.setup();

  function ControlledPopup() {
    const anchorRef = useRef<HTMLButtonElement>(null);
    const [open, setOpen] = useState(false);

    return (
      <>
        <button ref={anchorRef} type="button" onClick={() => setOpen(true)}>
          Open popup
        </button>
        <ContextPopup anchor={anchorRef.current} open={open} onOpenChange={setOpen}>
          <button type="button">Popup action</button>
        </ContextPopup>
      </>
    );
  }

  render(<ControlledPopup />);

  const trigger = screen.getByRole("button", { name: "Open popup" });
  await user.click(trigger);
  await waitFor(() => {
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Popup action" }));
  });

  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).toBeNull();
  await waitFor(() => {
    expect(document.activeElement).toBe(trigger);
  });
});
