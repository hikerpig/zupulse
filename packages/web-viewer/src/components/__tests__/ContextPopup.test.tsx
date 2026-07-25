// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
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
  expect(dialog.parentElement?.parentElement).toBe(document.body);
});
