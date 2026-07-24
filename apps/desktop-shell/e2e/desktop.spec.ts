import { expect, test, _electron as electron, type ElectronApplication } from "@playwright/test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const fixture = fileURLToPath(new URL("../../../test-fixtures/gp/generated/desktop-acceptance.gp", import.meta.url));
const musicXmlFixture = fileURLToPath(
  new URL("../../../test-fixtures/musicxml/generated/single-voice.musicxml", import.meta.url),
);
const mxlFixture = fileURLToPath(new URL("../../../test-fixtures/musicxml/generated/simple.mxl", import.meta.url));
const reviewedFixture = fileURLToPath(new URL("../../../test-fixtures/musicxml/K331-3_reviewed.mxl", import.meta.url));

async function launch(userData: string): Promise<ElectronApplication> {
  try {
    await writeFile(
      join(userData, "preferences.json"),
      `${JSON.stringify({ schemaVersion: "1.0.0", localePreference: "en-US" }, null, 2)}\n`,
      { encoding: "utf8", mode: 0o600, flag: "wx" },
    );
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
  }
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
  await window.getByRole("button", { name: "Practice settings" }).click();
  await expect(window.getByRole("complementary", { name: "Practice settings" })).toBeVisible();
}

test("starts offline with an isolated renderer", async () => {
  const userData = await mkdtemp(join(tmpdir(), "zupulse-e2e-security-"));
  const app = await launch(userData);
  try {
    const page = await app.firstWindow();
    await app.context().setOffline(true);
    await page.reload();
    await expect(page.getByRole("button", { name: "Import score" })).toBeVisible();
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

test("persists locale and keeps renderer and application menu synchronized", async () => {
  const userData = await mkdtemp(join(tmpdir(), "zupulse-e2e-locale-"));
  let app = await launch(userData);
  try {
    let window = await app.firstWindow();
    await window.getByRole("button", { name: "Language" }).click();
    await window.getByRole("menuitemradio", { name: "简体中文" }).click();
    await expect(window.getByRole("heading", { name: "曲谱库" })).toBeVisible();
    await window.getByRole("button", { name: "语言" }).click();
    await window.getByRole("menuitemradio", { name: "English" }).click();
    await expect(window.getByRole("heading", { name: "Score Library" })).toBeVisible();
    await expect
      .poll(() => app.evaluate(({ Menu }) => Menu.getApplicationMenu()?.items.map((item) => item.label) ?? []))
      .toContain("File");
    await app.close();

    app = await launch(userData);
    window = await app.firstWindow();
    await expect(window.getByRole("heading", { name: "Score Library" })).toBeVisible();
    await expect(window.getByRole("button", { name: "Language" })).toBeVisible();
  } finally {
    await app.close().catch(() => undefined);
    await rm(userData, { recursive: true, force: true });
  }
});

test("opens a GP file and restores persisted practice state", async () => {
  const userData = await mkdtemp(join(tmpdir(), "zupulse-e2e-persistence-"));
  let app = await launch(userData);
  try {
    await chooseFixture(app);
    let window = await app.firstWindow();
    await window.getByRole("button", { name: "Import score" }).first().click();
    await expect(window.locator("#summary")).toContainText("桌面验收谱");
    await expect(window.getByRole("button", { name: "Play" })).toBeEnabled();

    await window.getByRole("button", { name: /^Speed \d+ BPM, \d+%$/ }).click();
    const tempoInput = window.getByRole("spinbutton", { name: "Speed BPM" });
    const reducedTempo = String(Math.round(Number(await tempoInput.inputValue()) * 0.75));
    await tempoInput.fill(reducedTempo);
    await tempoInput.blur();
    await openPracticeSettings(window);
    await window.getByRole("combobox", { name: "Boundary snap" }).selectOption("off");
    await window.getByRole("button", { name: "Set A" }).click();
    await setRange(window.getByRole("slider", { name: "Loop point B" }), "500");
    await expect(window.getByRole("slider", { name: "Loop point B" })).toHaveValue("500");
    await window.getByRole("button", { name: "Save range" }).click();
    await expect(window.getByRole("textbox", { name: "Loop name" })).toHaveCount(1);
    await window.waitForTimeout(700);
    await app.close();

    app = await launch(userData);
    await chooseFixture(app);
    window = await app.firstWindow();
    await window.getByRole("button", { name: "Import score" }).first().click();
    await expect(window.locator("#summary")).toContainText("桌面验收谱");
    await window.getByRole("button", { name: `Speed ${reducedTempo} BPM` }).click();
    await expect(window.getByRole("spinbutton", { name: "Speed BPM" })).toHaveValue(reducedTempo);
    await openPracticeSettings(window);
    await expect(window.getByRole("textbox", { name: "Loop name" })).toHaveCount(1);
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
    await expect(window.getByRole("button", { name: "Import score" })).toBeVisible();
    await chooseFixture(app, musicXmlFixture);
    await window.getByRole("button", { name: "Import score" }).first().click();
    await expect(window.locator("#summary")).toContainText("Single Voice");

    await chooseFixture(app, mxlFixture);
    await window.getByRole("button", { name: "Import score" }).first().click();
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
    await window.getByRole("button", { name: "Import score" }).first().click();
    await expect(window.getByRole("link", { name: "Harmony analysis" })).toBeVisible();
    await window.getByRole("link", { name: "Harmony analysis" }).click();
    await expect(window.getByRole("heading", { level: 1, name: "Harmony analysis" })).toBeVisible();
    await expect(window.getByRole("button", { name: "Analysis settings" })).toBeVisible();
    const splitter = window.getByRole("separator", { name: "Resize score and analysis panels" });
    await splitter.focus();
    await window.keyboard.press("ArrowRight");
    await expect(splitter).toHaveAttribute("aria-valuenow", "45");
    await expect(window.getByRole("status", { name: "Analysis document status" })).toContainText("Saved");
    await expect(window.getByRole("heading", { name: "Chord candidates" })).toBeVisible();
    await window.getByRole("list", { name: "Structured chord candidates" }).getByRole("button").first().click();
    await expect(window.getByRole("status", { name: "Analysis document status" })).toContainText(
      "1 corrections · Saved",
    );
    await window.getByRole("button", { name: "Segment preview" }).click();
    await window.getByRole("button", { name: "Play preview" }).click();
    await expect(window.getByText("Preview playing")).toBeVisible();
    await window.getByRole("button", { name: "Pause preview" }).click();
    await window.getByRole("combobox", { name: "Preview speed" }).selectOption("1.5");
    await window.getByRole("slider", { name: "Preview position" }).fill("5000");
    await window.getByRole("button", { name: "Loop selected segment" }).click();
    await window.keyboard.press("Escape");
    await app.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
    }, exportPath);
    await window.getByRole("button", { name: "Export annotated score" }).click();
    await expect(window.getByText("Annotated score exported")).toBeVisible();
    await expect.poll(async () => new TextDecoder().decode(await readFile(exportPath))).toContain("<harmony>");
  } finally {
    await app.close();
    await rm(userData, { recursive: true, force: true });
  }
});

test("synchronizes a reviewed Studio selection and closes its runtime", async () => {
  const userData = await mkdtemp(join(tmpdir(), "zupulse-e2e-reviewed-studio-"));
  const app = await launch(userData);
  try {
    const window = await app.firstWindow();
    await chooseFixture(app, reviewedFixture);
    await window.getByRole("button", { name: "Import score" }).first().click();
    await window.getByRole("link", { name: "Harmony analysis" }).click();
    await expect(window.getByRole("status", { name: "Analysis document status" })).toContainText("Saved", {
      timeout: 30_000,
    });
    const list = window.getByRole("list", { name: "Analysis segments" });
    const segments = list.getByRole("button");
    const distantSegment = segments.last();
    await distantSegment.click();
    await expect(distantSegment).toHaveAttribute("aria-pressed", "true");
    await window.locator("#alpha-tab").evaluate((host) => {
      host.dispatchEvent(
        new CustomEvent("alphaTab.beatMouseDown", {
          detail: { displayStart: 0, voice: { bar: { index: 0 } } },
        }),
      );
    });
    await expect(distantSegment).toHaveAttribute("aria-pressed", "false");
    await expect(list.locator('[aria-pressed="true"]')).toHaveCount(1);
  } finally {
    await app.close();
    await rm(userData, { recursive: true, force: true });
  }
});
