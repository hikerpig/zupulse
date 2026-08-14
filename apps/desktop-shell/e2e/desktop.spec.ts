import { expect, test, _electron as electron, type ElectronApplication } from "@playwright/test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { gunzip } from "node:zlib";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const fixture = fileURLToPath(new URL("../../../test-fixtures/gp/generated/desktop-acceptance.gp", import.meta.url));
const musicXmlFixture = fileURLToPath(
  new URL("../../../test-fixtures/musicxml/generated/single-voice.musicxml", import.meta.url),
);
const mxlFixture = fileURLToPath(new URL("../../../test-fixtures/musicxml/generated/simple.mxl", import.meta.url));
const harmonySelectionFixture = fileURLToPath(
  new URL("../../../test-fixtures/musicxml/generated/harmony-selection.musicxml", import.meta.url),
);
const reviewedFixture = fileURLToPath(new URL("../../../test-fixtures/musicxml/K331-3_reviewed.mxl", import.meta.url));
const gunzipAsync = promisify(gunzip);
const pdfFixture = fileURLToPath(new URL("../../../test-fixtures/musicxml/K331-3_reviewed.pdf", import.meta.url));

async function launch(userData: string, environment: Record<string, string> = {}): Promise<ElectronApplication> {
  try {
    await writeFile(
      join(userData, "preferences.json"),
      `${JSON.stringify({ schemaVersion: "1.0.0", localePreference: "en-US" }, null, 2)}\n`,
      { encoding: "utf8", mode: 0o600, flag: "wx" },
    );
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
  }
  const inheritedEnvironment = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
  return electron.launch({
    args: [".", `--user-data-dir=${userData}`],
    env: { ...inheritedEnvironment, ...environment },
  });
}

async function chooseFixture(app: ElectronApplication, filePath = fixture): Promise<void> {
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
  }, filePath);
}

async function choosePdfFixture(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
  }, pdfFixture);
}

async function importSelectedFixture(window: import("@playwright/test").Page): Promise<void> {
  await window.getByRole("button", { name: "Import score", exact: true }).click();
  await window.getByTestId("import-score-picker").click();
  await window.getByTestId("import-score-submit").click();
}

async function openLibrary(window: import("@playwright/test").Page): Promise<void> {
  await window.getByRole("link", { name: "Library", exact: true }).click();
  await expect(window.getByRole("heading", { name: "Score Library" })).toBeVisible();
}

async function openPracticeSettings(window: import("@playwright/test").Page): Promise<void> {
  await window.getByRole("button", { name: "Practice settings" }).click();
  await expect(window.getByRole("complementary", { name: "Practice settings" })).toBeVisible();
}

async function openLoopSettings(window: import("@playwright/test").Page): Promise<void> {
  await openPracticeSettings(window);
  const practice = window.getByRole("complementary", { name: "Practice settings" });
  await practice.getByRole("button", { name: /Set loop range/ }).click();
  await expect(window.getByRole("heading", { name: "Set loop range" })).toBeVisible();
}

test("starts offline with an isolated renderer", async () => {
  const userData = await mkdtemp(join(tmpdir(), "zupulse-e2e-security-"));
  const app = await launch(userData);
  try {
    const page = await app.firstWindow();
    await app.context().setOffline(true);
    await page.reload();
    await openLibrary(page);
    await expect(page.getByRole("button", { name: "Import score" })).toBeVisible();
    expect(
      await page.evaluate(() => ({
        require: typeof (globalThis as { require?: unknown }).require,
        process: typeof (globalThis as { process?: unknown }).process,
        api: Object.keys(window.zupulseBridge ?? {}).sort(),
      })),
    ).toEqual({
      require: "undefined",
      process: "undefined",
      api: ["handleDroppedFiles", "request", "subscribe"],
    });

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

test("configures a recognition engine by picker or pasted path", async () => {
  const userData = await mkdtemp(join(tmpdir(), "zupulse-e2e-recognition-settings-"));
  const fakeAudiveris = join(userData, "fake-audiveris.sh");
  await writeFile(fakeAudiveris, '#!/bin/sh\nprintf "Audiveris 1.0.0\\n"\n', { encoding: "utf8", mode: 0o755 });
  const app = await launch(userData);
  try {
    const window = await app.firstWindow();
    await window.goto("zupulse://app/index.html#/settings");
    expect(
      await app.evaluate(({ Menu }) =>
        Menu.getApplicationMenu()?.items.some((item) =>
          item.submenu?.items.some((submenuItem) => submenuItem.role === "paste"),
        ),
      ),
    ).toBe(true);
    await window.getByRole("button", { name: "Audiveris Configure" }).click();
    await chooseFixture(app, fakeAudiveris);
    await window.getByRole("button", { name: "Choose Executable" }).click();
    const input = window.getByRole("textbox", { name: "Executable" });
    await expect(input).toHaveValue("fake-audiveris.sh");
    await input.clear();
    await app.evaluate(({ clipboard }, value) => clipboard.writeText(value), fakeAudiveris);
    await input.press(process.platform === "darwin" ? "Meta+V" : "Control+V");
    await expect(input).toHaveValue(fakeAudiveris);
    await window.getByRole("button", { name: "Validate and save" }).click();

    await expect(window.getByText("Ready · 1.0.0")).toBeVisible();
    await expect(window.getByText(fakeAudiveris)).toHaveCount(0);
  } finally {
    await app.close();
    await rm(userData, { recursive: true, force: true });
  }
});

test("keeps PDF OMR Desktop-only and observes a selected PDF without Library mutation", async () => {
  const userData = await mkdtemp(join(tmpdir(), "zupulse-e2e-pdf-omr-ui-"));
  const app = await launch(userData);
  try {
    const window = await app.firstWindow();
    await window.goto("zupulse://app/index.html#/pdf-omr");
    await expect(window.getByRole("heading", { name: "PDF recognition" })).toBeVisible();
    await expect(window.getByRole("link", { name: "PDF recognition" })).toBeVisible();
    await choosePdfFixture(app);
    await window.getByRole("button", { name: "Choose PDF or image" }).click();
    await expect(window.getByText("K331-3_reviewed.pdf").first()).toBeVisible();
    await expect(window.getByRole("tab", { name: "Original input" })).toHaveAttribute("aria-selected", "true");
    await expect(window.getByRole("button", { name: "Start extraction" })).toBeEnabled();
    await window.getByRole("button", { name: "Switch to light theme" }).click();
    await expect.poll(() => window.locator("html").getAttribute("data-theme")).toBe("light");
    await window.getByRole("button", { name: "Switch to dark theme" }).click();
    await window.setViewportSize({ width: 390, height: 844 });
    expect(await window.evaluate(() => document.documentElement.scrollWidth <= globalThis.innerWidth)).toBe(true);
    await window.setViewportSize({ width: 1440, height: 900 });
    await window.getByRole("link", { name: "Library", exact: true }).click();
    await expect(window.getByRole("heading", { name: "Score Library" })).toBeVisible();
    await expect(window.getByText("Your scores will stay on this device")).toBeVisible();
  } finally {
    await app.close();
    await rm(userData, { recursive: true, force: true });
  }
});

test("runs the packaged PDF OMR path through stage observation, transient preview, and native MXL export", async () => {
  test.setTimeout(60_000);
  const userData = await mkdtemp(join(tmpdir(), "zupulse-e2e-pdf-omr-run-"));
  const fakeAudiveris = join(userData, "fake-audiveris.sh");
  const retryMarker = join(userData, "fake-audiveris-failed-once");
  const exportPath = join(userData, "extracted-score.mxl");
  await writeFile(
    fakeAudiveris,
    [
      "#!/bin/sh",
      'if [ "$1" = "-version" ]; then printf "Audiveris 1.0.0\\n"; exit 0; fi',
      `if [ ! -f "${retryMarker}" ]; then : > "${retryMarker}"; exit 1; fi`,
      'output=""; previous=""',
      'for arg in "$@"; do if [ "$previous" = "-output" ]; then output="$arg"; fi; previous="$arg"; done',
      'mkdir -p "$output"',
      "cat > \"$output/K331-3_reviewed.mxl\" <<'XML'",
      '<?xml version="1.0"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><staff>1</staff></note></measure></part></score-partwise>',
      "XML",
      ': > "$output/K331-3_reviewed.omr"',
    ].join("\n") + "\n",
    { encoding: "utf8", mode: 0o755 },
  );
  const app = await launch(userData, {
    PDF_OMR_AUDIVERIS_EXECUTABLE: fakeAudiveris,
  });
  try {
    const window = await app.firstWindow();
    await window.goto("zupulse://app/index.html#/pdf-omr");
    await choosePdfFixture(app);
    await window.getByRole("button", { name: "Choose PDF or image" }).click();
    await window.getByRole("button", { name: "Start extraction" }).click();
    await expect(window.getByRole("button", { name: "Retry" })).toBeVisible({ timeout: 15_000 });
    await expect(window.getByRole("combobox", { name: "Recognition engine" })).toBeEnabled();
    await window.getByRole("button", { name: "Retry" }).click();
    await expect(window.getByText("MXL ready")).toBeVisible({ timeout: 45_000 });
    await expect(window.getByRole("tab", { name: "Extracted score" })).toBeEnabled();
    await window.getByRole("tab", { name: "Extracted score" }).click();
    await expect(window.getByText("Extracted score preview is ready")).toBeVisible({ timeout: 15_000 });
    await app.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
    }, exportPath);
    await window.getByRole("button", { name: "Export MXL" }).click();
    await expect(window.getByRole("button", { name: "MXL exported" })).toBeVisible();
    await expect.poll(async () => (await readFile(exportPath)).byteLength > 0).toBe(true);
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
    await window.getByRole("link", { name: "曲谱库", exact: true }).click();
    await expect(window.getByRole("heading", { name: "曲谱库" })).toBeVisible();
    await expect
      .poll(() =>
        app.evaluate(
          ({ Menu }) =>
            Menu.getApplicationMenu()
              ?.items.find((item) => item.label === "帮助")
              ?.submenu?.items.map((item) => item.label) ?? [],
        ),
      )
      .toContain("导出诊断信息…");
    await window.getByRole("button", { name: "语言" }).click();
    await window.getByRole("menuitemradio", { name: "English" }).click();
    await openLibrary(window);
    await expect
      .poll(() => app.evaluate(({ Menu }) => Menu.getApplicationMenu()?.items.map((item) => item.label) ?? []))
      .toContain("File");
    await expect
      .poll(() =>
        app.evaluate(
          ({ Menu }) =>
            Menu.getApplicationMenu()
              ?.items.find((item) => item.label === "Help")
              ?.submenu?.items.map((item) => item.label) ?? [],
        ),
      )
      .toContain("Export Diagnostic Information…");
    await app.close();

    app = await launch(userData);
    window = await app.firstWindow();
    await openLibrary(window);
    await expect(window.getByRole("button", { name: "Language" })).toBeVisible();
  } finally {
    await app.close().catch(() => undefined);
    await rm(userData, { recursive: true, force: true });
  }
});

test("exports validated diagnostics from the native Help menu", async () => {
  const userData = await mkdtemp(join(tmpdir(), "zupulse-e2e-diagnostics-"));
  const exportPath = join(userData, "diagnostics.jsonl.gz");
  const app = await launch(userData);
  try {
    await app.firstWindow();
    const menuItemFound = await app.evaluate(({ BrowserWindow, dialog, Menu }, path) => {
      const state = { saveDialogCalled: false, errorMessage: "" };
      (globalThis as unknown as { diagnosticExportE2E: typeof state }).diagnosticExportE2E = state;
      dialog.showSaveDialog = async () => {
        state.saveDialogCalled = true;
        return { canceled: false, filePath: path };
      };
      dialog.showMessageBox = async (
        _windowOrOptions: Electron.BaseWindow | Electron.MessageBoxOptions,
        _options?: Electron.MessageBoxOptions,
      ): Promise<Electron.MessageBoxReturnValue> => {
        state.errorMessage = "shown";
        return { response: 0, checkboxChecked: false };
      };
      const item = Menu.getApplicationMenu()?.getMenuItemById("export-diagnostics");
      item?.click(item, BrowserWindow.getAllWindows()[0]!, {} as Electron.KeyboardEvent);
      return item !== undefined;
    }, exportPath);
    expect(menuItemFound).toBe(true);
    await expect
      .poll(() =>
        app.evaluate(() =>
          Boolean(
            (globalThis as unknown as { diagnosticExportE2E?: { saveDialogCalled: boolean } }).diagnosticExportE2E
              ?.saveDialogCalled,
          ),
        ),
      )
      .toBe(true);

    await expect
      .poll(async () =>
        readFile(exportPath)
          .then((data) => data.byteLength > 0)
          .catch(() => false),
      )
      .toBe(true);
    const jsonl = String(await gunzipAsync(await readFile(exportPath)));
    const events = jsonl
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    expect(events).toEqual(expect.arrayContaining([expect.objectContaining({ code: "APP_STARTED", source: "main" })]));
    expect(jsonl).not.toContain(userData);
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
    await openLibrary(window);
    await importSelectedFixture(window);
    await expect(window.getByRole("heading", { level: 1 })).toContainText("桌面验收谱");
    await expect(window.getByRole("button", { name: "Play" })).toBeEnabled({ timeout: 30_000 });

    await window.getByRole("button", { name: /^Speed \d+ BPM, \d+%$/ }).click();
    const tempoInput = window.getByRole("spinbutton", { name: "Speed BPM" });
    const reducedTempo = String(Math.round(Number(await tempoInput.inputValue()) * 0.75));
    await tempoInput.fill(reducedTempo);
    await tempoInput.blur();
    await openLoopSettings(window);
    await window.getByRole("combobox", { name: "Boundary snap" }).selectOption("off");
    const scorePointB = window.getByLabel("Score loop range").getByRole("slider", { name: "Loop point B" });
    await expect(scorePointB).toBeVisible();
    await scorePointB.press("ArrowLeft");
    await window.getByRole("button", { name: "Save range" }).click();
    await expect(window.getByRole("textbox", { name: "Loop name" })).toHaveCount(1);
    await window.waitForTimeout(700);
    await app.close();

    app = await launch(userData);
    window = await app.firstWindow();
    await openLibrary(window);
    await expect(window.getByText("Last practiced at measure 1")).toBeVisible();
    await window.getByRole("button", { name: "Continue practicing 桌面验收谱" }).click();
    await expect(window.getByRole("heading", { level: 1 })).toContainText("桌面验收谱");
    await window.getByRole("button", { name: `Speed ${reducedTempo} BPM` }).click();
    await expect(window.getByRole("spinbutton", { name: "Speed BPM" })).toHaveValue(reducedTempo);
    await openLoopSettings(window);
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
    await openLibrary(window);
    await expect(window.getByRole("button", { name: "Import score" })).toBeVisible();
    await chooseFixture(app, musicXmlFixture);
    await importSelectedFixture(window);
    await expect(window.getByRole("heading", { level: 1 })).toContainText("Single Voice");

    await window.getByRole("link", { name: "Library" }).click();
    await chooseFixture(app, mxlFixture);
    await importSelectedFixture(window);
    await expect(window.getByRole("heading", { level: 1 })).toContainText("Single Voice");
  } finally {
    await app.close();
    await rm(userData, { recursive: true, force: true });
  }
});

test("uses the bundled sample as a normal Desktop Library Score", async () => {
  const userData = await mkdtemp(join(tmpdir(), "zupulse-e2e-sample-"));
  const exportPath = join(userData, "cannon-in-d.mxl");
  const app = await launch(userData);
  try {
    const window = await app.firstWindow();
    await openLibrary(window);
    await importBundledSample(window, "Import your own scores");
    const firstId = window.url().split("/viewer/")[1];
    expect(firstId).toBeTruthy();

    await window.getByRole("link", { name: "Library" }).click();
    await importBundledSample(window, "Import score");
    expect(window.url()).toContain(firstId);

    await window.getByRole("link", { name: "Library" }).click();
    await app.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
    }, exportPath);
    await window.getByRole("button", { name: "More actions for Cannon in D" }).click();
    await window.getByRole("menuitem", { name: "Export Cannon in D", exact: true }).click();
    await expect.poll(async () => (await readFile(exportPath)).byteLength > 0).toBe(true);

    await window.getByRole("button", { name: "More actions for Cannon in D" }).click();
    await window.getByRole("menuitem", { name: "Delete Cannon in D", exact: true }).click();
    await window.getByRole("button", { name: "Delete permanently" }).click();
    await importBundledSample(window, "Import your own scores");
    const secondId = window.url().split("/viewer/")[1];
    expect(secondId).toBeTruthy();
    expect(secondId).not.toBe(firstId);
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
    await openLibrary(window);
    await chooseFixture(app, musicXmlFixture);
    await importSelectedFixture(window);
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

test("keeps K331 responsive and terminates a cancelled Desktop analysis", async () => {
  test.setTimeout(60_000);
  const userData = await mkdtemp(join(tmpdir(), "zupulse-e2e-harmony-worker-"));
  const app = await launch(userData);
  try {
    const window = await app.firstWindow();
    await openLibrary(window);
    await chooseFixture(app, reviewedFixture);
    await importSelectedFixture(window);
    await window.getByRole("link", { name: "Harmony analysis" }).click();
    const documentStatus = window.getByRole("status", { name: "Analysis document status" });
    await expect(documentStatus).toContainText("Saved", { timeout: 30_000 });

    await window.getByRole("button", { name: "Reanalyze" }).click();
    const cancel = window.getByRole("button", { name: "Cancel analysis" });
    await expect(cancel).toBeVisible({ timeout: 1_000 });
    await window.evaluate(() => {
      const probe = {
        ticks: 0,
        maximumDelayMs: 0,
        previous: performance.now(),
        timer: undefined as ReturnType<typeof setInterval> | undefined,
      };
      probe.timer = globalThis.setInterval(() => {
        const now = performance.now();
        probe.maximumDelayMs = Math.max(probe.maximumDelayMs, now - probe.previous - 5);
        probe.previous = now;
        probe.ticks += 1;
      }, 5);
      (globalThis as unknown as { harmonyResponsivenessProbe: typeof probe }).harmonyResponsivenessProbe = probe;
    });
    await window.waitForTimeout(100);
    const responsiveness = await window.evaluate(() => {
      const probe = (
        globalThis as unknown as {
          harmonyResponsivenessProbe: {
            ticks: number;
            maximumDelayMs: number;
            timer: ReturnType<typeof setInterval> | undefined;
          };
        }
      ).harmonyResponsivenessProbe;
      if (probe.timer !== undefined) globalThis.clearInterval(probe.timer);
      return { ticks: probe.ticks, maximumDelayMs: probe.maximumDelayMs };
    });
    expect(responsiveness.ticks).toBeGreaterThan(5);
    expect(responsiveness.maximumDelayMs).toBeLessThanOrEqual(50);
    await cancel.click();
    await expect(window.getByRole("button", { name: "Reanalyze" })).toBeVisible();
    await expect(documentStatus).toContainText("Saved");
  } finally {
    await app.close();
    await rm(userData, { recursive: true, force: true });
  }
});

async function importBundledSample(window: import("@playwright/test").Page, buttonName: string): Promise<void> {
  await window.getByRole("button", { name: buttonName, exact: true }).click();
  await window.getByRole("button", { name: "Use sample Cannon in D" }).click();
  await window.getByRole("button", { name: "Import 1" }).click();
  await expect.poll(() => window.url()).toContain("#/viewer/");
}

test("synchronizes a Studio selection and closes its runtime", async () => {
  const userData = await mkdtemp(join(tmpdir(), "zupulse-e2e-selection-studio-"));
  const app = await launch(userData);
  try {
    const window = await app.firstWindow();
    await openLibrary(window);
    await chooseFixture(app, harmonySelectionFixture);
    await importSelectedFixture(window);
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
