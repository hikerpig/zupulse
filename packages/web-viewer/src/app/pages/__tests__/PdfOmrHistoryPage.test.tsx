// @vitest-environment jsdom
import { I18nextProvider } from "react-i18next";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { createAppI18n } from "@zupulse/app-i18n";
import { PdfOmrHistoryPage } from "../PdfOmrHistoryPage";

afterEach(cleanup);

describe("PdfOmrHistoryPage", () => {
  it("lists shared jobs and deletes one explicitly", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const history = {
      list: vi.fn(async () => ({
        items: [
          {
            jobId: "job-1",
            status: "succeeded" as const,
            input: { fileName: "sonata.pdf", sizeBytes: 4096, inputKind: "pdf" as const },
            attemptCount: 1,
            engineId: "audiveris",
            createdAt: "2026-08-16T00:00:00.000Z",
            updatedAt: "2026-08-16T00:01:00.000Z",
            expiresAt: "2026-09-15T00:00:00.000Z",
          },
        ],
      })),
      create: vi.fn(),
      open: vi.fn(),
      delete: vi.fn(async () => undefined),
    };
    render(
      <I18nextProvider i18n={createAppI18n("zh-CN")}>
        <MemoryRouter>
          <PdfOmrHistoryPage history={history} />
        </MemoryRouter>
      </I18nextProvider>,
    );

    expect((await screen.findByRole("link", { name: "sonata.pdf" })).getAttribute("href")).toBe("/pdf-omr/job-1");
    expect(screen.getByRole("link", { name: "新建识谱任务" }).getAttribute("href")).toBe("/pdf-omr/new");
    await userEvent.setup().click(screen.getByRole("button", { name: "删除 sonata.pdf" }));
    expect(history.delete).toHaveBeenCalledWith("job-1");
    await waitFor(() => expect(history.list).toHaveBeenCalledTimes(2));
  });
});
