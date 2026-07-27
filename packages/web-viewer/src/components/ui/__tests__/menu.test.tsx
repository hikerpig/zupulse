// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { MenuItem, MenuPopup, MenuPortal, MenuPositioner, MenuRoot, MenuTrigger } from "../menu";

afterEach(cleanup);

it("supports keyboard navigation and restores trigger focus on Escape", async () => {
  const user = userEvent.setup();
  render(
    <MenuRoot>
      <MenuTrigger>Actions</MenuTrigger>
      <MenuPortal>
        <MenuPositioner>
          <MenuPopup>
            <MenuItem>Export</MenuItem>
            <MenuItem>Delete</MenuItem>
          </MenuPopup>
        </MenuPositioner>
      </MenuPortal>
    </MenuRoot>,
  );

  const trigger = screen.getByRole("button", { name: "Actions" });
  trigger.focus();
  await user.keyboard("{Enter}");
  await waitFor(() => {
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Export" }));
  });

  await user.keyboard("{ArrowDown}");
  expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Delete" }));

  await user.keyboard("{Escape}");
  expect(screen.queryByRole("menu")).toBeNull();
  expect(document.activeElement).toBe(trigger);
});
