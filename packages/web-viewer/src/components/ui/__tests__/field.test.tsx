// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Field, Select, TextField } from "../field";

afterEach(cleanup);

describe("Field and TextField", () => {
  it("associates its visible label with the input", async () => {
    const user = userEvent.setup();
    render(
      <Field label="Title">
        <TextField name="title" />
      </Field>,
    );

    const input = screen.getByRole("textbox", { name: "Title" });
    await user.type(input, "Etude");

    expect((input as HTMLInputElement).value).toBe("Etude");
  });

  it("connects description and error copy to the invalid input", () => {
    render(
      <Field label="Artist" description="Shown in the library" error="Artist is required">
        <TextField name="artist" />
      </Field>,
    );

    const input = screen.getByRole("textbox", { name: "Artist" });
    const describedBy = input.getAttribute("aria-describedby")?.split(" ") ?? [];
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(describedBy).toContain(screen.getByText("Shown in the library").id);
    expect(describedBy).toContain(screen.getByRole("alert").id);
  });

  it("preserves native disabled behavior", async () => {
    const user = userEvent.setup();
    render(<TextField aria-label="Read only title" disabled />);

    const input = screen.getByRole("textbox", { name: "Read only title" }) as HTMLInputElement;
    await user.type(input, "Ignored");

    expect(input.disabled).toBe(true);
    expect(input.value).toBe("");
  });
});

describe("Select", () => {
  it("associates its label and reports native selection changes", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Field label="Sort">
        <Select defaultValue="activity" onChange={onChange}>
          <option value="activity">Recent activity</option>
          <option value="title">Title</option>
        </Select>
      </Field>,
    );

    const select = screen.getByRole("combobox", { name: "Sort" }) as HTMLSelectElement;
    await user.selectOptions(select, "title");

    expect(select.value).toBe("title");
    expect(onChange).toHaveBeenCalledOnce();
  });
});
