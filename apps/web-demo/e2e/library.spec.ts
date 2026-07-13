import { expect, test, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";

const fixture = fileURLToPath(new URL("../../../test-fixtures/gp/generated/desktop-acceptance.gp", import.meta.url));

test("persists a Browser Library Score and gives a re-import a fresh ID after deletion", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "曲谱库" })).toBeVisible();

  await importFixture(page, "导入第一份曲谱");
  await expect(page.locator("#summary")).toContainText("桌面验收谱");
  const firstId = page.url().split("/viewer/")[1];
  expect(firstId).toBeTruthy();

  await page.getByRole("link", { name: "返回曲谱库" }).click();
  await expect(page.getByRole("heading", { name: "曲谱库" })).toBeVisible();
  await expect(page.locator(".library-row").getByText("桌面验收谱", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator(".library-row").getByText("桌面验收谱", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "删除 桌面验收谱" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("全部练习数据");
  await page.getByRole("button", { name: "永久删除" }).click();
  await expect(page.getByText("你的曲谱会保存在这台设备上")).toBeVisible();

  await importFixture(page, "导入第一份曲谱");
  await expect(page.locator("#summary")).toContainText("桌面验收谱");
  const secondId = page.url().split("/viewer/")[1];
  expect(secondId).toBeTruthy();
  expect(secondId).not.toBe(firstId);
});

async function importFixture(page: Page, buttonName: string): Promise<void> {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: buttonName }).click();
  await (await chooser).setFiles(fixture);
  await expect.poll(() => page.url()).toContain("#/viewer/");
}
