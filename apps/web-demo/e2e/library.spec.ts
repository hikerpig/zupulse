import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const fixture = fileURLToPath(new URL("../../../test-fixtures/gp/generated/desktop-acceptance.gp", import.meta.url));
const musicXmlFixture = fileURLToPath(
  new URL("../../../test-fixtures/musicxml/generated/single-voice.musicxml", import.meta.url),
);
const multiPartFixture = fileURLToPath(
  new URL("../../../test-fixtures/musicxml/generated/multi-part.musicxml", import.meta.url),
);
const harmonySelectionFixture = fileURLToPath(
  new URL("../../../test-fixtures/musicxml/generated/harmony-selection.musicxml", import.meta.url),
);
const reviewedFixture = fileURLToPath(new URL("../../../test-fixtures/musicxml/K331-3_reviewed.mxl", import.meta.url));

test("keeps the Library sort select compact on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/#/library");

  const sort = page.getByRole("combobox", { name: "排序" });
  await expect(sort).toBeVisible();
  await expect(sort).toHaveCSS("appearance", "none");
  await expect(sort).toHaveCSS("padding-right", "34px");
  await expect.poll(async () => (await sort.boundingBox())?.width).toBeLessThanOrEqual(140);
});

test("adds single and multiple Browser drops to the import review without importing on outside drops", async ({
  page,
}) => {
  await page.goto("/#/library");
  await page.getByRole("button", { name: "导入自己的曲谱" }).click();
  const dropZone = page.getByRole("button", { name: "选择文件或拖放文件" });

  await dropFiles(page, dropZone, [{ name: "single.musicxml", bytes: await readFile(musicXmlFixture) }]);
  await expect(page.getByText("single.musicxml")).toBeVisible();

  await dropFiles(page, dropZone, [
    { name: "multi.musicxml", bytes: await readFile(multiPartFixture) },
    { name: "invalid.gp", bytes: Buffer.from("not a score") },
  ]);
  await expect(page.getByText("multi.musicxml")).toBeVisible();
  await expect(page.getByText("invalid.gp")).toBeVisible();

  const dialog = page.getByRole("dialog", { name: "导入曲谱" });
  await dropFiles(page, dialog, [{ name: "outside.musicxml", bytes: await readFile(musicXmlFixture) }]);
  await expect(page.getByText("outside.musicxml")).toHaveCount(0);

  await page.getByRole("button", { name: "导入 3 份" }).click();
  await expect(page.getByRole("region", { name: /导入汇总/ })).toContainText("失败 1");
});

test("imports, reuses, exports, deletes, and re-adds the bundled sample as a normal Library Score", async ({
  page,
}) => {
  await page.goto("/#/library");
  await importBundledSample(page, "导入自己的曲谱");
  const firstId = page.url().split("/viewer/")[1];
  expect(firstId).toBeTruthy();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Cannon in D");

  await page.getByRole("navigation", { name: "主要页面" }).getByRole("link", { name: "曲谱库" }).click();
  await importBundledSample(page, "导入曲谱");
  expect(page.url()).toContain(firstId);

  await page.getByRole("navigation", { name: "主要页面" }).getByRole("link", { name: "曲谱库" }).click();
  await page.getByRole("button", { name: "Cannon in D 的更多操作" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "导出 Cannon in D", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("cannon-in-d.mxl");

  await page.getByRole("button", { name: "Cannon in D 的更多操作" }).click();
  await page.getByRole("menuitem", { name: "删除 Cannon in D", exact: true }).click();
  await page.getByRole("button", { name: "永久删除" }).click();
  await importBundledSample(page, "导入自己的曲谱");
  const secondId = page.url().split("/viewer/")[1];
  expect(secondId).toBeTruthy();
  expect(secondId).not.toBe(firstId);
});

test("persists English across representative Library, Viewer, and Studio flows", async ({ page }) => {
  await page.goto("/#/library");
  await page.getByRole("button", { name: "语言" }).click();
  await page.getByRole("menuitemradio", { name: "English" }).click();
  await expect(page.getByRole("heading", { name: "Score Library" })).toBeVisible();

  await importFixture(page, "Import your own scores", musicXmlFixture);
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
  await page.goto("/#/library");
  await importFixture(page, "导入自己的曲谱");
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

test("keeps Viewer and Studio navigation within a 390px App Header", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/library");
  await importFixture(page, "导入自己的曲谱");

  const navigation = page.getByRole("navigation", { name: "主要页面" });
  await expect(navigation.getByRole("link", { name: "首页", exact: true })).toBeHidden();
  await expect.poll(() => navigation.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await navigation.getByRole("link", { name: "和弦工作室" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "和弦分析" })).toBeVisible();
  await expect.poll(() => navigation.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("closes a detached Transport BPM popup and keeps the narrow Practice trigger usable", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/#/library");
  await importFixture(page, "导入自己的曲谱");

  await page.getByRole("button", { name: /速度 \d+ BPM/ }).click();
  await expect(page.getByRole("spinbutton", { name: "速度 BPM" })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("spinbutton", { name: "速度 BPM" })).toHaveCount(0);

  await page.getByRole("button", { name: "练习设置" }).click();
  const practice = page.getByRole("complementary", { name: "练习设置" });
  const practiceSpeed = practice.getByRole("button", { name: /速度 \d+ BPM/ });
  await practiceSpeed.click();
  await expect(page.getByRole("spinbutton", { name: "速度 BPM" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(practiceSpeed).toBeFocused();
});

test("persists independent metronome and count-in practice settings", async ({ page }) => {
  await page.goto("/#/library");
  await importFixture(page, "导入自己的曲谱", musicXmlFixture);
  await page.getByRole("button", { name: "练习设置" }).click();
  const practice = page.getByRole("complementary", { name: "练习设置" });
  await practice.getByRole("button", { name: /节拍与预备拍/ }).click();

  const metronome = practice.getByRole("switch", { name: "节拍器" });
  const countIn = practice.getByRole("switch", { name: "播放前预备一小节" });
  await metronome.check();
  await countIn.check();
  await practice.getByRole("slider", { name: "节拍器音量" }).fill("42");
  await practice.getByRole("slider", { name: "预备拍音量" }).fill("73");
  await expect(practice.getByText("练习设置尚未保存")).toBeVisible();
  await expect(practice.getByText("练习设置尚未保存")).toBeHidden();

  await page.reload();
  await page.getByRole("button", { name: "练习设置" }).click();
  const restored = page.getByRole("complementary", { name: "练习设置" });
  await restored.getByRole("button", { name: /节拍与预备拍/ }).click();
  await expect(restored.getByRole("switch", { name: "节拍器" })).toBeChecked();
  await expect(restored.getByRole("switch", { name: "播放前预备一小节" })).toBeChecked();
  await expect(restored.getByRole("slider", { name: "节拍器音量" })).toHaveValue("42");
  await expect(restored.getByRole("slider", { name: "预备拍音量" })).toHaveValue("73");

  await page.getByRole("button", { name: "关闭练习设置" }).click();
  await page.getByRole("button", { name: "播放" }).click();
  const countInStatus = page.getByRole("status").filter({ hasText: "预备拍" });
  await expect(countInStatus).toBeVisible();
});

test("switches and persists piano hand accompaniment while preserving playback", async ({ page }) => {
  await page.goto("/#/library");
  await importFixture(page, "导入自己的曲谱", reviewedFixture);
  await page.getByRole("button", { name: "播放" }).click();
  await expect(page.getByRole("button", { name: "暂停" })).toBeVisible();
  await page.getByRole("button", { name: "练习设置" }).click();
  const practice = page.getByRole("complementary", { name: "练习设置" });
  await practice.getByRole("button", { name: /练习手/ }).click();

  await practice.getByText("练右手", { exact: true }).click();
  await expect(practice.getByRole("radio", { name: "练右手" })).toBeChecked();
  await expect(page.getByRole("button", { name: "暂停" })).toBeVisible();
  const preview = practice.getByRole("button", { name: "临时试听练习手" });
  await preview.click();
  await expect(practice.getByRole("button", { name: "恢复伴奏手" })).toHaveAttribute("aria-pressed", "true");
  await practice.getByRole("button", { name: "恢复伴奏手" }).click();
  await expect(preview).toHaveAttribute("aria-pressed", "false");
  await expect(practice.getByText("练习设置尚未保存")).toBeHidden();

  await page.reload();
  await page.getByRole("button", { name: "练习设置" }).click();
  const restored = page.getByRole("complementary", { name: "练习设置" });
  await restored.getByRole("button", { name: /练习手/ }).click();
  await expect(restored.getByRole("radio", { name: "练右手" })).toBeChecked();
});

test("shows piano key lookahead without displacing playback controls", async ({ page }) => {
  await page.goto("/#/library");
  await importFixture(page, "导入自己的曲谱", reviewedFixture);
  await page.getByRole("button", { name: "练习设置" }).click();
  const practice = page.getByRole("complementary", { name: "练习设置" });
  await practice.getByRole("button", { name: /琴键引导/ }).click();
  await practice.getByRole("switch", { name: "显示琴键引导" }).check();
  await page.getByRole("button", { name: "关闭练习设置" }).click();

  const visualization = page.getByRole("region", { name: "琴键引导" });
  await expect(visualization).toBeVisible();
  await expect(visualization.locator("[data-hint-layer] [data-hand]").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "播放" })).toBeVisible();
  const scoreWorkspace = page.getByRole("region", { name: "乐谱工作区" });
  await expect
    .poll(async () => {
      const scoreBounds = await scoreWorkspace.boundingBox();
      const pianoBounds = await visualization.boundingBox();
      if (!scoreBounds || !pianoBounds) return Number.POSITIVE_INFINITY;
      return Math.round(scoreBounds.y + scoreBounds.height - pianoBounds.y);
    })
    .toBeLessThanOrEqual(-8);
  const heightSeparator = visualization.getByRole("separator", { name: "调整琴键引导高度" });
  const initialVisualizationHeight = await visualization.boundingBox();
  const separatorBounds = await heightSeparator.boundingBox();
  expect(Math.round(initialVisualizationHeight?.height ?? 0)).toBe(260);
  if (!separatorBounds) throw new Error("Piano key height separator is not measurable");
  const separatorCenterX = separatorBounds.x + separatorBounds.width / 2;
  const separatorCenterY = separatorBounds.y + separatorBounds.height / 2;
  await page.mouse.move(separatorCenterX, separatorCenterY);
  await page.mouse.down();
  await page.mouse.move(separatorCenterX, separatorCenterY - 40);
  await page.mouse.up();
  await expect.poll(async () => Math.round((await visualization.boundingBox())?.height ?? 0)).toBe(300);
  await expect
    .poll(async () => {
      const scoreBounds = await scoreWorkspace.boundingBox();
      const pianoBounds = await visualization.boundingBox();
      if (!scoreBounds || !pianoBounds) return Number.POSITIVE_INFINITY;
      return Math.round(scoreBounds.y + scoreBounds.height - pianoBounds.y);
    })
    .toBeLessThanOrEqual(-8);

  const visualFrame = () =>
    visualization.evaluate((region) => ({
      active: region.querySelectorAll("[data-key-pitch][data-active]").length,
      hints: Array.from(region.querySelectorAll("[data-hint-layer] rect"))
        .slice(0, 12)
        .map((hint) => [hint.getAttribute("data-pitch"), hint.getAttribute("y"), hint.getAttribute("height")]),
    }));
  const initialFrame = await visualFrame();
  await page.getByRole("button", { name: "播放" }).click();
  await expect(page.getByRole("button", { name: "暂停" })).toBeVisible();
  await expect.poll(visualFrame).not.toEqual(initialFrame);
  await expect.poll(async () => (await visualFrame()).active).toBeGreaterThan(0);

  await page.getByRole("button", { name: "暂停" }).click();
  await expect(page.getByRole("button", { name: "播放" })).toBeVisible();
  await page.waitForTimeout(100);
  const pausedFrame = await visualFrame();
  await page.waitForTimeout(300);
  expect(await visualFrame()).toEqual(pausedFrame);

  await page.getByRole("button", { name: "停止" }).click();
  await expect.poll(visualFrame).toEqual(initialFrame);

  for (const width of [390, 620, 1280]) {
    await page.setViewportSize({ width, height: width === 1280 ? 720 : 844 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(visualization).toBeVisible();
    await expectInsideViewport(page, page.getByRole("button", { name: "播放" }));
  }

  await page.getByRole("button", { name: "关闭琴键引导" }).click();
  await expect(visualization).toHaveCount(0);
  await expect(page.locator(".score-viewer .at-surface").first()).toBeVisible();

  await page.reload();
  await expect(page.getByRole("region", { name: "琴键引导" })).toHaveCount(0);
});

test("keeps the Library to Viewer transition on a loading surface until the score renders", async ({ page }) => {
  await page.goto("/#/library");
  await importFixture(page, "导入自己的曲谱");
  await expect(page.locator(".score-viewer .at-surface").first()).toBeVisible();
  await page.getByRole("navigation", { name: "主要页面" }).getByRole("link", { name: "曲谱库" }).click();

  const openScore = page.getByRole("button", { name: /^(打开|继续练习) 桌面验收谱$/ });
  const click = openScore.click();
  await expect(page).toHaveURL(/#\/viewer\//);
  await expect(page.getByRole("status", { name: "正在加载文件" })).toBeVisible();
  await click;

  await expect(page.getByRole("heading", { level: 1, name: "桌面验收谱" })).toBeVisible();
  await expect(page.locator(".score-viewer .at-surface").first()).toBeVisible();
  await expect(page.getByText("曲谱库不可用")).toHaveCount(0);
});

test("follows playback and supports stable score page navigation", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.goto("/#/library");
  await importFixture(page, "导入自己的曲谱", reviewedFixture);
  await expect(page.locator(".score-viewer .at-surface").first()).toBeVisible();

  await page.getByRole("button", { name: "谱面导航模式" }).click();
  await page.getByRole("button", { name: "翻页" }).click();
  const pageStatus = page.getByRole("status", { name: /第 \d+ \/ \d+ 页/ });
  await expect(pageStatus).toBeVisible();
  const initialStatus = await pageStatus.textContent();

  await page.locator(".score-viewer").click({ position: { x: 20, y: 20 } });
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
    await expect(page.locator(".score-viewer .at-surface").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "谱面导航模式" })).toBeVisible();
  }
  expect(consoleErrors).toEqual([]);
});

test("keeps a comfortable wide score and applies visible zoom layouts", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/#/library");
  await importFixture(page, "导入自己的曲谱", reviewedFixture);
  const scoreHost = page.locator(".score-viewer");
  const surface = scoreHost.locator(".at-surface").first();
  await expect(surface).toBeVisible();

  const comfortable = await scoreFrameMetrics(scoreHost);
  expect(comfortable.frameWidth).toBeLessThanOrEqual(960);
  expect(Math.abs(comfortable.leftGutter - comfortable.rightGutter)).toBeLessThanOrEqual(2);

  await page.getByRole("button", { name: "切换为全宽" }).click();
  await expect(page.getByRole("button", { name: "恢复舒适宽度" })).toBeVisible();
  await expect.poll(async () => (await scoreFrameMetrics(scoreHost)).frameWidth).toBeGreaterThan(960);

  await page.reload();
  await expect(page.getByRole("button", { name: "恢复舒适宽度" })).toBeVisible();
  await expect.poll(async () => (await scoreFrameMetrics(scoreHost)).frameWidth).toBeGreaterThan(960);
  await page.getByRole("button", { name: "恢复舒适宽度" }).click();

  const initialSurfaceHeight = (await surface.boundingBox())!.height;
  await page.getByRole("button", { name: "放大谱面" }).click();
  await expect(page.getByRole("button", { name: "重置谱面缩放" })).toHaveText("110%");
  await expect.poll(async () => (await surface.boundingBox())!.height).toBeGreaterThan(initialSurfaceHeight);

  await page.keyboard.press("Control+0");
  await expect(page.getByRole("button", { name: "重置谱面缩放" })).toHaveText("100%");

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "切换为全宽" })).toBeHidden();
  await expect(page.getByRole("button", { name: "调整谱面缩放" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("persists a Browser Library Score and gives a re-import a fresh ID after deletion", async ({ page }) => {
  await page.goto("/#/library");
  await expect(page.getByRole("heading", { name: "曲谱库" })).toBeVisible();

  await importFixture(page, "导入自己的曲谱");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("桌面验收谱");
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

  await importFixture(page, "导入自己的曲谱");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("桌面验收谱");
  const secondId = page.url().split("/viewer/")[1];
  expect(secondId).toBeTruthy();
  expect(secondId).not.toBe(firstId);
});

test("opens a MusicXML Library Score in Studio and restores its saved document", async ({ page }) => {
  await page.goto("/#/library");
  await importFixture(page, "导入自己的曲谱", musicXmlFixture);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Single Voice");
  await page.getByRole("link", { name: "和弦分析" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "和弦分析" })).toBeVisible();
  await expect(page.getByRole("button", { name: "分析设置" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  const scoreWorkspace = page.getByRole("region", { name: "乐谱工作区" });
  const analysisRegion = page.getByRole("region", { name: "分析状态" });
  const analysisPane = analysisRegion.locator("..");
  await expect(scoreWorkspace).toBeVisible();
  await expect(analysisRegion).toBeVisible();
  const mobileAnalysisBox = (await analysisPane.boundingBox())!;
  expect(mobileAnalysisBox.y).toBeLessThan(844);
  expect(mobileAnalysisBox.y + mobileAnalysisBox.height).toBeLessThanOrEqual(844);
  await expect(analysisPane).toHaveCSS("overflow-y", "auto");

  await page.setViewportSize({ width: 1280, height: 480 });
  const studioEditor = page.getByRole("region", { name: "和弦编辑器" });
  await expect(studioEditor).toBeVisible();
  expect(
    await studioEditor.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      overflowY: getComputedStyle(element).overflowY,
    })),
  ).toMatchObject({ overflowY: "auto" });
  expect(await studioEditor.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);

  await page.setViewportSize({ width: 1280, height: 720 });
  const studioSurface = page.locator("#alpha-tab .at-surface").first();
  await expect(studioSurface).toBeVisible();
  const initialStudioHeight = (await studioSurface.boundingBox())!.height;
  await page.getByRole("button", { name: "放大谱面" }).click();
  await expect(page.getByRole("button", { name: "重置谱面缩放" })).toHaveText("110%");
  await expect.poll(async () => (await studioSurface.boundingBox())!.height).toBeGreaterThan(initialStudioHeight);
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
  await page.goto("/#/library");
  await expect(page.getByRole("heading", { name: "曲谱库" })).toBeVisible();
  await page.getByRole("button", { name: "Single Voice 的更多操作" }).click();
  await page.getByRole("menuitem", { name: "删除 Single Voice", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toContainText("全部练习数据");
  await page.getByRole("button", { name: "永久删除" }).click();
  await expect(page.getByRole("button", { name: "导入自己的曲谱" })).toBeVisible();
});

test("reanalyses a multi-part Studio scope and allows a track to be added back", async ({ page }) => {
  await page.goto("/#/library");
  await importFixture(page, "导入自己的曲谱", multiPartFixture);
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

test("keeps K331 responsive and terminates a cancelled analysis", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/#/library");
  await importFixture(page, "导入自己的曲谱", reviewedFixture);
  await page.getByRole("link", { name: "和弦分析" }).click();
  const documentStatus = page.getByRole("status", { name: "分析文档状态" });
  await expect(documentStatus).toContainText("已保存", { timeout: 30_000 });
  await expect(page.getByText("预览不可用：无法在当前乐谱上显示和弦预览")).toHaveCount(0);
  const ranges = page.getByRole("list", { name: "分析片段" });
  const allFilter = page.getByRole("button", { name: "全部 123", exact: true });
  const unresolvedFilter = page.getByRole("button", { name: "待确认 21", exact: true });
  await expect(allFilter).toContainText("123");
  await expect(unresolvedFilter).toContainText("21");
  await expect(unresolvedFilter).toHaveAttribute("aria-pressed", "true");
  await allFilter.click();
  await expect(ranges.locator('[data-type="chord"]')).toHaveCount(100);
  await expect(ranges.locator('[data-type="unresolved"]')).toHaveCount(21);
  await expect(ranges.locator('[data-type="no-chord"]')).toHaveCount(2);
  await expect(ranges.locator('button[data-origin="source"]')).toHaveCount(2);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出标注曲谱" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("K331-3_reviewed-chords.mxl");
  expect(await download.failure()).toBeNull();
  await expect(page.getByText("已导出标注曲谱")).toBeVisible();

  await page.getByRole("button", { name: "重新分析" }).click();
  const cancel = page.getByRole("button", { name: "取消分析" });
  await expect(cancel).toBeVisible({ timeout: 1_000 });
  await page.evaluate(() => {
    const probe = { ticks: 0, maximumDelayMs: 0, previous: performance.now(), timer: 0 };
    probe.timer = window.setInterval(() => {
      const now = performance.now();
      probe.maximumDelayMs = Math.max(probe.maximumDelayMs, now - probe.previous - 5);
      probe.previous = now;
      probe.ticks += 1;
    }, 5);
    (window as unknown as { harmonyResponsivenessProbe: typeof probe }).harmonyResponsivenessProbe = probe;
  });
  await page.waitForTimeout(100);
  const responsiveness = await page.evaluate(() => {
    const probe = (
      window as unknown as {
        harmonyResponsivenessProbe: { ticks: number; maximumDelayMs: number; timer: number };
      }
    ).harmonyResponsivenessProbe;
    window.clearInterval(probe.timer);
    return { ticks: probe.ticks, maximumDelayMs: probe.maximumDelayMs };
  });
  expect(responsiveness.ticks).toBeGreaterThan(5);
  expect(responsiveness.maximumDelayMs).toBeLessThanOrEqual(50);
  await cancel.click();
  await expect(page.getByRole("button", { name: "重新分析" })).toBeVisible();
  await expect(documentStatus).toContainText("已保存");
});

test("synchronizes a score selection between the range list and alphaTab", async ({ page }) => {
  await page.goto("/#/library");
  await importFixture(page, "导入自己的曲谱", harmonySelectionFixture);
  await page.getByRole("link", { name: "和弦分析" }).click();
  await expect(page.getByRole("status", { name: "分析文档状态" })).toContainText("已保存", { timeout: 30_000 });
  const list = page.getByRole("list", { name: "分析片段" });
  const segments = list.getByRole("button");
  await expect(segments.nth(1)).toBeVisible();
  const distantSegment = segments.last();
  await distantSegment.click();
  await expect(distantSegment).toHaveAttribute("aria-pressed", "true");
  await page.locator(".score-viewer").evaluate((host) => {
    host.parentElement?.scrollTo({ top: 0 });
  });

  const scoreSurface = page.locator(".score-viewer .at-surface").first();
  await expect(scoreSurface).toBeVisible();
  await page.locator(".score-viewer").evaluate((host) => {
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
  await page.goto("/#/library");
  await importFixture(page, "导入自己的曲谱", musicXmlFixture);
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
  await page.goto("/#/library");
  await importFixture(page, "导入自己的曲谱");
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
  await expectInsideViewport(page, page.getByRole("button", { name: "循环模式" }));
  await expectInsideViewport(page, page.getByRole("button", { name: "练习设置" }));

  const loopModeButton = page.getByRole("button", { name: "循环模式" });
  await loopModeButton.click();
  await expect(loopModeButton).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("complementary", { name: "练习设置" })).toHaveCount(0);
  const scoreLoopRange = page.getByLabel("谱面循环区间");
  const scorePointA = scoreLoopRange.getByRole("slider", { name: "循环 A 点" });
  await expect(scorePointA).toBeVisible();
  await expect(scoreLoopRange.getByRole("slider", { name: "循环 B 点" })).toBeVisible();
  const initialPointA = await scorePointA.getAttribute("aria-valuenow");
  await scorePointA.press("ArrowRight");
  await expect(scorePointA).not.toHaveAttribute("aria-valuenow", initialPointA ?? "");
  await loopModeButton.click();
  await expect(loopModeButton).toHaveAttribute("aria-pressed", "false");
  await expect(scoreLoopRange).toHaveCount(0);
  await loopModeButton.click();
  await expect(loopModeButton).toHaveAttribute("aria-pressed", "true");
  await expect(scoreLoopRange).toBeVisible();

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
  await page.getByRole("button", { name: buttonName }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /选择文件|Choose or drop files/ }).click();
  await (await chooser).setFiles(filePath);
  await page.getByRole("button", { name: /导入 1 份|Import 1/ }).click();
  await expect.poll(() => page.url()).toContain("#/viewer/");
}

async function importBundledSample(page: Page, buttonName: string): Promise<void> {
  await page.getByRole("button", { name: buttonName, exact: true }).click();
  await page.getByRole("button", { name: "使用样例 Cannon in D" }).click();
  await page.getByRole("button", { name: "导入 1 份" }).click();
  await expect.poll(() => page.url()).toContain("#/viewer/");
}

async function dropFiles(
  page: Page,
  target: Locator,
  files: readonly { name: string; bytes: Uint8Array }[],
): Promise<void> {
  await target.evaluate(
    (element, droppedFiles) => {
      const transfer = new DataTransfer();
      for (const file of droppedFiles) {
        transfer.items.add(new File([new Uint8Array(file.bytes)], file.name));
      }
      element.dispatchEvent(new DragEvent("dragenter", { bubbles: true, dataTransfer: transfer }));
      element.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
    },
    files.map((file) => ({ name: file.name, bytes: Array.from(file.bytes) })),
  );
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

async function scoreFrameMetrics(scoreHost: Locator): Promise<{
  frameWidth: number;
  leftGutter: number;
  rightGutter: number;
}> {
  return scoreHost.evaluate((host) => {
    const frame = host.parentElement?.parentElement;
    const stage = frame?.parentElement;
    if (!frame || !stage) throw new Error("Score frame is missing");
    const frameBounds = frame.getBoundingClientRect();
    const stageBounds = stage.getBoundingClientRect();
    return {
      frameWidth: frameBounds.width,
      leftGutter: frameBounds.left - stageBounds.left,
      rightGutter: stageBounds.right - frameBounds.right,
    };
  });
}
