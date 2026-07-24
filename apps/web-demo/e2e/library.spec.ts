import { expect, test, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";

const fixture = fileURLToPath(new URL("../../../test-fixtures/gp/generated/desktop-acceptance.gp", import.meta.url));
const musicXmlFixture = fileURLToPath(
  new URL("../../../test-fixtures/musicxml/generated/single-voice.musicxml", import.meta.url),
);
const multiPartFixture = fileURLToPath(
  new URL("../../../test-fixtures/musicxml/generated/multi-part.musicxml", import.meta.url),
);
const reviewedFixture = fileURLToPath(new URL("../../../test-fixtures/musicxml/K331-3_reviewed.mxl", import.meta.url));

test("persists English across representative Library, Viewer, and Studio flows", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "语言" }).click();
  await page.getByRole("menuitemradio", { name: "English" }).click();
  await expect(page.getByRole("heading", { name: "Score Library" })).toBeVisible();

  await importFixture(page, "Import your first score", musicXmlFixture);
  await expect(page.getByRole("link", { name: "Harmony analysis" })).toBeVisible();
  await page.getByRole("link", { name: "Harmony analysis" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Harmony analysis" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Chord candidates" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Harmony analysis" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Language" })).toBeVisible();
});

test("switches locale during playback without losing workspace state and keeps controls reachable", async ({
  page,
}) => {
  await page.goto("/");
  await importFixture(page, "导入第一份曲谱");
  const viewerUrl = page.url();
  const play = page.getByRole("button", { name: "播放" });
  await expect(play).toBeEnabled();
  await play.click();
  await expect(page.getByRole("button", { name: "暂停" })).toBeVisible();
  await page.getByRole("button", { name: "练习设置" }).click();

  await page.getByRole("button", { name: "语言" }).click();
  await page.getByRole("menuitemradio", { name: "English" }).click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Practice settings" })).toBeVisible();
  expect(page.url()).toBe(viewerUrl);

  for (const width of [768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Language" })).toBeVisible();
  }
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("persists a Browser Library Score and gives a re-import a fresh ID after deletion", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "曲谱库" })).toBeVisible();

  await importFixture(page, "导入第一份曲谱");
  await expect(page.locator("#summary")).toContainText("桌面验收谱");
  const firstId = page.url().split("/viewer/")[1];
  expect(firstId).toBeTruthy();

  await page.getByRole("navigation", { name: "主要页面" }).getByRole("link", { name: "曲谱库" }).click();
  await expect(page.getByRole("heading", { name: "曲谱库" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^GP 收藏 桌面验收谱/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: /^GP 收藏 桌面验收谱/ })).toBeVisible();

  await page.getByRole("button", { name: "删除 桌面验收谱", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toContainText("全部练习数据");
  await page.getByRole("button", { name: "永久删除" }).click();
  await expect(page.getByText("你的曲谱会保存在这台设备上")).toBeVisible();

  await importFixture(page, "导入第一份曲谱");
  await expect(page.locator("#summary")).toContainText("桌面验收谱");
  const secondId = page.url().split("/viewer/")[1];
  expect(secondId).toBeTruthy();
  expect(secondId).not.toBe(firstId);
});

test("opens a MusicXML Library Score in Studio and restores its saved document", async ({ page }) => {
  await page.goto("/");
  await importFixture(page, "导入第一份曲谱", musicXmlFixture);
  await expect(page.locator("#summary")).toContainText("Single Voice");
  await page.getByRole("link", { name: "和弦分析" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "和弦分析" })).toBeVisible();
  await expect(page.getByRole("button", { name: "分析设置" })).toBeVisible();
  const splitter = page.getByRole("separator", { name: "调整乐谱与分析面板宽度" });
  await splitter.focus();
  await page.keyboard.press("ArrowRight");
  await expect(splitter).toHaveAttribute("aria-valuenow", "45");
  await expect(page.getByRole("status", { name: "分析文档状态" })).toContainText("已保存");
  await expect(page.getByRole("heading", { name: "和弦候选" })).toBeVisible();
  await page.getByRole("list", { name: "结构化和弦候选" }).getByRole("button").first().click();
  await expect(page.getByRole("status", { name: "分析文档状态" })).toContainText("1 个修正 · 已保存");
  await page.getByRole("button", { name: "片段试听" }).click();
  await page.getByRole("button", { name: "播放预览" }).click();
  const audioUnavailable = page.getByRole("alert").filter({ hasText: "试听不可用" });
  if (await audioUnavailable.count()) {
    await expect(audioUnavailable).toBeVisible();
  } else {
    await expect(page.getByText(/预览播放中|预览已暂停/)).toBeVisible();
    const pause = page.getByRole("button", { name: "暂停预览" });
    if (await pause.count()) await pause.click();
  }
  await page.getByRole("combobox", { name: "预览速度" }).selectOption("1.5");
  await page.getByRole("slider", { name: "预览位置" }).fill("5000");
  await page.getByRole("button", { name: "循环选中片段" }).click();
  await page.keyboard.press("Escape");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出标注曲谱" }).click();
  expect((await download).suggestedFilename()).toBe("single-voice-chords.musicxml");
  await expect(page.getByText("已导出标注曲谱")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("status", { name: "分析文档状态" })).toContainText("已保存", { timeout: 30_000 });
  await expect(page.getByRole("separator", { name: "调整乐谱与分析面板宽度" })).toHaveAttribute("aria-valuenow", "45");
  await expect(page.getByRole("status", { name: "分析文档状态" })).toContainText("1 个修正 · 已保存");
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "曲谱库" })).toBeVisible();
  await page.getByRole("button", { name: "删除 Single Voice", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toContainText("全部练习数据");
  await page.getByRole("button", { name: "永久删除" }).click();
  await expect(page.getByRole("button", { name: "导入第一份曲谱" })).toBeVisible();
});

test("reanalyses a multi-part Studio scope and allows a track to be added back", async ({ page }) => {
  await page.goto("/");
  await importFixture(page, "导入第一份曲谱", multiPartFixture);
  await page.getByRole("link", { name: "和弦分析" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "和弦分析" })).toBeVisible();
  await expect(page.getByRole("status", { name: "分析文档状态" })).toContainText("已保存");
  await page.getByRole("button", { name: "分析设置" }).click();
  await page.getByText("分析范围", { exact: true }).click();
  const scope = page.getByRole("listbox", { name: "分析范围" });
  await expect(scope.locator("option")).toHaveCount(4);
  await scope.selectOption(["track-1"]);
  await expect(scope.locator("option:checked")).toHaveCount(1);
  await scope.selectOption(["track-1", "track-2"]);
  await expect(scope.locator("option:checked")).toHaveCount(2);
});

test("synchronizes a reviewed score selection between the range list and alphaTab", async ({ page }) => {
  await page.goto("/");
  await importFixture(page, "导入第一份曲谱", reviewedFixture);
  await page.getByRole("link", { name: "和弦分析" }).click();
  await expect(page.getByRole("status", { name: "分析文档状态" })).toContainText("已保存", { timeout: 30_000 });
  const list = page.getByRole("list", { name: "分析片段" });
  const segments = list.getByRole("button");
  await expect(segments.nth(1)).toBeVisible();
  const distantSegment = segments.last();
  await distantSegment.click();
  await expect(distantSegment).toHaveAttribute("aria-pressed", "true");
  await page.locator("#alpha-tab").evaluate((host) => {
    host.parentElement?.scrollTo({ top: 0 });
  });

  const scoreSurface = page.locator("#alpha-tab .at-surface").first();
  await expect(scoreSurface).toBeVisible();
  await page.locator("#alpha-tab").evaluate((host) => {
    host.dispatchEvent(
      new CustomEvent("alphaTab.beatMouseDown", {
        detail: { displayStart: 0, voice: { bar: { index: 0 } } },
      }),
    );
  });
  await expect(distantSegment).toHaveAttribute("aria-pressed", "false");
  await expect(list.locator('[aria-pressed="true"]')).toHaveCount(1);
});

test("surfaces a CAS conflict when two Browser Studio windows save the same revision", async ({ page, context }) => {
  await page.goto("/");
  await importFixture(page, "导入第一份曲谱", musicXmlFixture);
  await page.getByRole("link", { name: "和弦分析" }).click();
  await expect(page.getByRole("status", { name: "分析文档状态" })).toContainText("已保存");

  const stalePage = await context.newPage();
  await stalePage.goto(page.url());
  await expect(stalePage.getByRole("status", { name: "分析文档状态" })).toContainText("已保存");

  await page.getByRole("list", { name: "结构化和弦候选" }).getByRole("button").first().click();
  await expect(page.getByRole("status", { name: "分析文档状态" })).toContainText("1 个修正 · 已保存");
  await stalePage.getByRole("list", { name: "结构化和弦候选" }).getByRole("button").first().click();
  await expect(stalePage.getByRole("alert")).toContainText("版本冲突");
  await stalePage.close();
});

async function importFixture(page: Page, buttonName: string, filePath = fixture): Promise<void> {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: buttonName }).click();
  await (await chooser).setFiles(filePath);
  await expect.poll(() => page.url()).toContain("#/viewer/");
}
