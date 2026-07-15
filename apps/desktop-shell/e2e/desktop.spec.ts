import { expect, test, _electron as electron, type ElectronApplication } from "@playwright/test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const fixture = fileURLToPath(new URL("../../../test-fixtures/gp/generated/desktop-acceptance.gp", import.meta.url));
const musicXmlFixture = fileURLToPath(
  new URL("../../../test-fixtures/musicxml/generated/single-voice.musicxml", import.meta.url),
);
const mxlFixture = fileURLToPath(new URL("../../../test-fixtures/musicxml/generated/simple.mxl", import.meta.url));

async function launch(userData: string): Promise<ElectronApplication> {
  return electron.launch({ args: [".", `--user-data-dir=${userData}`] });
}

async function chooseFixture(app: ElectronApplication, filePath = fixture): Promise<void> {
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
  }, filePath);
}

async function setRange(locator: import("@playwright/test").Locator, value: string): Promise<void> {
  await locator.fill(value);
  await locator.blur();
}

async function openPracticeSettings(window: import("@playwright/test").Page): Promise<void> {
  await window.getByRole("button", { name: "练习设置" }).click();
  await expect(window.getByRole("complementary", { name: "练习设置" })).toBeVisible();
}

test("starts offline with an isolated renderer", async () => {
  const userData = await mkdtemp(join(tmpdir(), "zupulse-e2e-security-"));
  const app = await launch(userData);
  try {
    const page = await app.firstWindow();
    await app.context().setOffline(true);
    await page.reload();
    await expect(page.getByRole("button", { name: "导入曲谱" })).toBeVisible();
    expect(
      await page.evaluate(() => ({
        require: typeof (globalThis as { require?: unknown }).require,
        process: typeof (globalThis as { process?: unknown }).process,
        api: Object.keys(window.zupulseBridge ?? {}).sort(),
      })),
    ).toEqual({ require: "undefined", process: "undefined", api: ["request", "subscribe"] });

    await expect(
      page.evaluate(async () => {
        try {
          await window.zupulseBridge?.request({ type: "fs.read", payload: {} });
          return "accepted";
        } catch {
          return "rejected";
        }
      }),
    ).resolves.toBe("rejected");
    await expect(
      page.evaluate(async () => {
        try {
          await fetch("https://example.com/");
          return "accepted";
        } catch {
          return "rejected";
        }
      }),
    ).resolves.toBe("rejected");
    expect(await page.evaluate(() => window.open("https://example.com/") === null)).toBe(true);
  } finally {
    await app.close();
    await rm(userData, { recursive: true, force: true });
  }
});

test("opens a GP file and restores persisted practice state", async () => {
  const userData = await mkdtemp(join(tmpdir(), "zupulse-e2e-persistence-"));
  let app = await launch(userData);
  try {
    await chooseFixture(app);
    let window = await app.firstWindow();
    await window.getByRole("button", { name: "导入曲谱" }).first().click();
    await expect(window.locator("#summary")).toContainText("桌面验收谱");
    await expect(window.getByRole("button", { name: "播放" })).toBeEnabled();

    await window.getByRole("button", { name: /^速度 \d+ BPM$/ }).click();
    const tempoInput = window.getByRole("spinbutton", { name: "速度 BPM" });
    const reducedTempo = String(Math.round(Number(await tempoInput.inputValue()) * 0.75));
    await tempoInput.fill(reducedTempo);
    await tempoInput.blur();
    await openPracticeSettings(window);
    await window.getByRole("combobox", { name: "边界吸附" }).selectOption("off");
    await window.getByRole("button", { name: "设为 A" }).click();
    await setRange(window.getByRole("slider", { name: "循环 B 点" }), "500");
    await expect(window.getByRole("slider", { name: "循环 B 点" })).toHaveValue("500");
    await window.getByRole("button", { name: "保存区间" }).click();
    await expect(window.locator(".loop-row")).toHaveCount(1);
    await window.waitForTimeout(700);
    await app.close();

    app = await launch(userData);
    await chooseFixture(app);
    window = await app.firstWindow();
    await window.getByRole("button", { name: "导入曲谱" }).first().click();
    await expect(window.locator("#summary")).toContainText("桌面验收谱");
    await window.getByRole("button", { name: `速度 ${reducedTempo} BPM` }).click();
    await expect(window.getByRole("spinbutton", { name: "速度 BPM" })).toHaveValue(reducedTempo);
    await openPracticeSettings(window);
    await expect(window.locator(".loop-row")).toHaveCount(1);
  } finally {
    await app.close().catch(() => undefined);
    await rm(userData, { recursive: true, force: true });
  }
});

test("opens MusicXML and MXL through the unified score entry", async () => {
  const userData = await mkdtemp(join(tmpdir(), "zupulse-e2e-musicxml-"));
  const app = await launch(userData);
  try {
    const window = await app.firstWindow();
    await expect(window.getByRole("button", { name: "导入曲谱" })).toBeVisible();
    await chooseFixture(app, musicXmlFixture);
    await window.getByRole("button", { name: "导入曲谱" }).first().click();
    await expect(window.locator("#summary")).toContainText("Single Voice");

    await chooseFixture(app, mxlFixture);
    await window.getByRole("button", { name: "导入曲谱" }).first().click();
    await expect(window.locator("#summary")).toContainText("Single Voice");
  } finally {
    await app.close();
    await rm(userData, { recursive: true, force: true });
  }
});

test("opens a saved MusicXML Studio document", async () => {
  const userData = await mkdtemp(join(tmpdir(), "zupulse-e2e-studio-"));
  const exportPath = join(userData, "single-voice-chords.musicxml");
  const app = await launch(userData);
  try {
    const window = await app.firstWindow();
    await chooseFixture(app, musicXmlFixture);
    await window.getByRole("button", { name: "导入曲谱" }).first().click();
    await expect(window.getByRole("link", { name: "和弦分析" })).toBeVisible();
    await window.getByRole("link", { name: "和弦分析" }).click();
    await expect(window.getByRole("heading", { name: "和弦分析工作室" })).toBeVisible();
    await expect(window.getByRole("status").filter({ hasText: "已加载分析结果" })).toBeVisible();
    await expect(window.getByRole("heading", { name: "和弦候选" })).toBeVisible();
    await window.getByRole("list", { name: "结构化和弦候选" }).getByRole("button").first().click();
    await expect(window.getByText("已保存 1 个修正")).toBeVisible();
    await app.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
    }, exportPath);
    await window.getByRole("button", { name: "导出标注曲谱" }).click();
    await expect(window.getByText("已导出标注曲谱")).toBeVisible();
    await expect.poll(async () => new TextDecoder().decode(await readFile(exportPath))).toContain("<harmony>");
  } finally {
    await app.close();
    await rm(userData, { recursive: true, force: true });
  }
});
