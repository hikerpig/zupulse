// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import {
  DialogBackdrop,
  DialogClose,
  DialogDescription,
  DialogPopup,
  DialogPortal,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
  DialogViewport,
  PopoverClose,
  PopoverPopup,
  PopoverPortal,
  PopoverPositioner,
  PopoverRoot,
  PopoverTitle,
  PopoverTrigger,
} from "../overlay";

afterEach(cleanup);

describe("Popover overlay", () => {
  it("moves focus inside, closes with Escape, and restores trigger focus", async () => {
    const user = userEvent.setup();
    render(
      <PopoverRoot>
        <PopoverTrigger>Open settings</PopoverTrigger>
        <PopoverPortal>
          <PopoverPositioner>
            <PopoverPopup>
              <PopoverTitle>Settings</PopoverTitle>
              <PopoverClose>Close settings</PopoverClose>
            </PopoverPopup>
          </PopoverPositioner>
        </PopoverPortal>
      </PopoverRoot>,
    );

    const trigger = screen.getByRole("button", { name: "Open settings" });
    await user.click(trigger);
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close settings" }));
    });

    await user.keyboard("{Escape}");
    expect(screen.queryByText("Settings")).toBeNull();
    await waitFor(() => {
      expect(document.activeElement).toBe(trigger);
    });
  });
});

describe("Dialog overlay", () => {
  it("provides a modal dialog with title and description, then restores focus on close", async () => {
    const user = userEvent.setup();
    render(
      <DialogRoot>
        <DialogTrigger>Delete score</DialogTrigger>
        <DialogPortal>
          <DialogBackdrop />
          <DialogViewport>
            <DialogPopup>
              <DialogTitle>Delete this score?</DialogTitle>
              <DialogDescription>This cannot be undone.</DialogDescription>
              <DialogClose>Cancel</DialogClose>
            </DialogPopup>
          </DialogViewport>
        </DialogPortal>
      </DialogRoot>,
    );

    const trigger = screen.getByRole("button", { name: "Delete score" });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Delete this score?" });
    expect(dialog.getAttribute("aria-describedby")).not.toBeNull();
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" }));
    });

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => {
      expect(document.activeElement).toBe(trigger);
    });
  });
});
