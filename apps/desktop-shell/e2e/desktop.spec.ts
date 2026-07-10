import { expect, test, _electron as electron, type ElectronApplication } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const fixture = fileURLToPath(
  new URL("../../../test-fixtures/gp/generated/desktop-acceptance.gp", import.meta.url),
);

async function launch(userData: string): Promise<ElectronApplication> {
  return electron.launch({ args: [".", `--user-data-dir=${userData}`] });
}

async function chooseFixture(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
  }, fixture);
}

async function setRange(
  locator: import("@playwright/test").Locator,
  value: string,
): Promise<void> {
  await locator.evaluate((element, nextValue) => {
    const input = element as HTMLInputElement;
    input.value = nextValue;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

test("starts offline with an isolated renderer", async () => {
  const userData = await mkdtemp(join(tmpdir(), "tab-viewer-e2e-security-"));
  const app = await launch(userData);
  try {
    const window = await app.firstWindow();
    await app.context().setOffline(true);
    await window.reload();
    await expect(window.locator("#open-score")).toBeVisible();
    expect(await window.evaluate(() => ({
      require: typeof (globalThis as { require?: unknown }).require,
      process: typeof (globalThis as { process?: unknown }).process,
      api: Object.keys(window.tabViewerBridge ?? {}).sort(),
    }))).toEqual({ require: "undefined", process: "undefined", api: ["request", "subscribe"] });

    await expect(window.evaluate(async () => {
      try {
        await window.tabViewerBridge?.request({ type: "fs.read", payload: {} });
        return "accepted";
      } catch {
        return "rejected";
      }
    })).resolves.toBe("rejected");
    await expect(window.evaluate(async () => {
      try {
        await fetch("https://example.com/");
        return "accepted";
      } catch {
        return "rejected";
      }
    })).resolves.toBe("rejected");
    expect(await window.evaluate(() => window.open("https://example.com/") === null)).toBe(true);
  } finally {
    await app.close();
    await rm(userData, { recursive: true, force: true });
  }
});

test("opens a GP file and restores persisted practice state", async () => {
  const userData = await mkdtemp(join(tmpdir(), "tab-viewer-e2e-persistence-"));
  let app = await launch(userData);
  try {
    await chooseFixture(app);
    let window = await app.firstWindow();
    await window.locator("#open-score").click();
    await expect(window.locator("#summary")).toContainText("桌面验收谱");

    await setRange(window.locator("#play-speed"), "75");
    await setRange(window.locator("#loop-start"), "0");
    await setRange(window.locator("#loop-end"), "500");
    await expect(window.locator("#loop-end")).toHaveValue("500");
    await window.locator("#loop-save").click();
    await expect(window.locator('[data-action="select-loop"]')).toHaveCount(1);
    await window.waitForTimeout(700);
    await app.close();

    app = await launch(userData);
    await chooseFixture(app);
    window = await app.firstWindow();
    await window.locator("#open-score").click();
    await expect(window.locator("#summary")).toContainText("桌面验收谱");
    await expect(window.locator("#play-speed")).toHaveValue("75");
    await expect(window.locator('[data-action="select-loop"]')).toHaveCount(1);
  } finally {
    await app.close().catch(() => undefined);
    await rm(userData, { recursive: true, force: true });
  }
});
