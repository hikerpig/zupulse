import { expect, test, type Locator, type Page } from "@playwright/test";
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

test("follows playback and supports stable score page navigation", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.goto("/");
  await importFixture(page, "导入第一份曲谱", reviewedFixture);
  await expect(page.locator("#alpha-tab .at-surface").first()).toBeVisible();

  await page.getByRole("button", { name: "谱面导航模式" }).click();
  await page.getByRole("button", { name: "翻页" }).click();
  const pageStatus = page.getByRole("status", { name: /第 \d+ \/ \d+ 页/ });
  await expect(pageStatus).toBeVisible();
  const initialStatus = await pageStatus.textContent();

  await page.keyboard.press("PageDown");
  await expect(pageStatus).not.toHaveText(initialStatus ?? "");
  await expect(page.getByRole("button", { name: "返回播放位置" })).toBeVisible();
  await page.getByRole("button", { name: "返回播放位置" }).click();
  await expect(page.getByRole("button", { name: "返回播放位置" })).toBeHidden();

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(page.locator("#alpha-tab .at-surface").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "谱面导航模式" })).toBeVisible();
  }
  expect(consoleErrors).toEqual([]);
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
  await expect(page.getByRole("button", { name: /^(打开|继续练习) 桌面验收谱$/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: /^(打开|继续练习) 桌面验收谱$/ })).toBeVisible();

  await page.getByRole("button", { name: "桌面验收谱 的更多操作" }).click();
  await page.getByRole("menuitem", { name: "删除 桌面验收谱", exact: true }).click();
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
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const splitter = page.getByRole("separator", { name: "调整乐谱与分析面板宽度" });
  await splitter.focus();
  await page.keyboard.press("ArrowRight");
  await expect(splitter).toHaveAttribute("aria-valuenow", "45");
  await expect(page.getByRole("status", { name: "分析文档状态" })).toContainText("已保存");
  await expect(page.getByRole("heading", { name: "和弦候选" })).toBeVisible();
  await page.getByRole("list", { name: "结构化和弦候选" }).getByRole("button").first().click();
  await expect(page.getByRole("status", { name: "分析文档状态" })).toContainText("1 个修正 · 已保存");
  await page.getByRole("button", { name: "片段试听" }).click();
  const previewPosition = page.getByRole("slider", { name: "预览位置" });
  await page.getByRole("button", { name: "播放预览" }).click();
  const audioUnavailable = page.getByRole("alert").filter({ hasText: "试听不可用" });
  const pausePreview = page.getByRole("button", { name: "暂停预览" });
  await expect(pausePreview.or(audioUnavailable)).toBeVisible();
  if (await pausePreview.isVisible()) {
    // alphaTab reports playing before its AudioWorklet source has finished starting.
    await page.waitForTimeout(500);
    await pausePreview.click();
    await expect(page.getByRole("button", { name: "播放预览" })).toBeVisible();
    await page.getByRole("combobox", { name: "预览速度" }).selectOption("1.5");
    await previewPosition.fill("5000");
    await page.getByRole("button", { name: "循环选中片段" }).click();
  } else {
    await expect(audioUnavailable).toBeVisible();
  }
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
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
  await page.getByRole("button", { name: "Single Voice 的更多操作" }).click();
  await page.getByRole("menuitem", { name: "删除 Single Voice", exact: true }).click();
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

test("keeps the Library to Viewer practice journey usable from 390px through desktop", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await importFixture(page, "导入第一份曲谱");
  await page.getByRole("navigation", { name: "主要页面" }).getByRole("link", { name: "曲谱库" }).click();

  const libraryControls = [
    page.getByRole("button", { name: "导入曲谱" }),
    page.getByRole("textbox", { name: "搜索曲名或艺术家" }),
    page.getByRole("button", { name: "收藏", exact: true }),
    page.getByRole("combobox"),
    page.getByRole("button", { name: /^(打开|继续练习) 桌面验收谱$/ }),
    page.getByRole("button", { name: "桌面验收谱 的更多操作" }),
  ];
  for (const width of [390, 620, 640, 1280]) {
    await page.setViewportSize({ width, height: width === 1280 ? 720 : 844 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const control of libraryControls) await expectInsideViewport(page, control);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  const search = page.getByRole("textbox", { name: "搜索曲名或艺术家" });
  await search.fill("不存在");
  await expect(page.getByText("没有匹配“不存在”的曲谱")).toBeVisible();
  await expect(page.getByText("0 / 1 份曲谱")).toBeVisible();
  await page.getByRole("button", { name: "清除搜索" }).click();
  await page.getByRole("button", { name: /^(打开|继续练习) 桌面验收谱$/ }).click();

  await expect(page.getByRole("button", { name: "导入曲谱" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "播放" })).toBeEnabled({ timeout: 30_000 });
  await expectInsideViewport(page, page.getByRole("button", { name: "播放" }));
  await expectInsideViewport(page, page.getByRole("button", { name: "停止" }));
  await expectInsideViewport(page, page.getByRole("button", { name: "设置循环区间" }));
  await expectInsideViewport(page, page.getByRole("button", { name: "练习设置" }));

  const zoom = page.getByRole("button", { name: "调整谱面缩放" });
  await expect(zoom).toBeVisible();
  await zoom.click();
  await expect(page.getByRole("dialog", { name: "调整谱面缩放" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(zoom).toBeFocused();

  const practiceTrigger = page.getByRole("button", { name: "练习设置" });
  await practiceTrigger.click();
  const practice = page.getByRole("complementary", { name: "练习设置" });
  await expect(practice.getByRole("button", { name: /速度 \d+ BPM/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "关闭练习设置" })).toBeFocused();
  await expect(practice.getByRole("button", { name: /设置循环区间/ })).toBeVisible();
  await practice.getByRole("button", { name: /选择主轨道/ }).click();
  await expect(practice.getByRole("heading", { name: "选择主轨道" })).toBeVisible();
  const backToPractice = practice.getByRole("button", { name: "返回练习设置" });
  await expect(backToPractice).toBeFocused();
  await backToPractice.click();
  await expect(practice.getByRole("button", { name: /设置循环区间/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(practice).toHaveCount(0);
  await expect(practiceTrigger).toBeFocused();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

async function importFixture(page: Page, buttonName: string, filePath = fixture): Promise<void> {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: buttonName }).click();
  await (await chooser).setFiles(filePath);
  await expect.poll(() => page.url()).toContain("#/viewer/");
}

async function expectInsideViewport(page: Page, locator: Locator): Promise<void> {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(
    box!.x + box!.width,
    `${(await locator.getAttribute("aria-label")) ?? (await locator.textContent())} stays within ${viewport!.width}px`,
  ).toBeLessThanOrEqual(viewport!.width);
}
