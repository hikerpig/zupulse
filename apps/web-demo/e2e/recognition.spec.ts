import { expect, test } from "@playwright/test";

test("uploads, follows, restores, and downloads a remote recognition job", async ({ page }) => {
  await page.goto("/#/pdf-omr");
  await expect(page.getByRole("heading", { name: "识谱历史" })).toBeVisible();
  await page.getByRole("link", { name: "新建识谱任务" }).click();

  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "选择 PDF 或图片" }).click();
  await (
    await chooser
  ).setFiles({
    name: "browser-score.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.7"),
  });
  await page.getByRole("button", { name: "开始提取" }).click();

  await expect(page).toHaveURL(/#\/pdf-omr\/00000000-0000-4000-8000-000000000001$/);
  await expect(page.getByText("MusicXML", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("MusicXML", { exact: true })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 MXL" }).click();
  expect((await download).suggestedFilename()).toBe("score.mxl");
});
