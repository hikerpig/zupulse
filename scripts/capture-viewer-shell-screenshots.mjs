import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const outDir = join(root, "screenshots");
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
const page = await context.newPage();

async function setShellTheme(shell, theme) {
  await page.evaluate(
    ([nextShell, nextTheme]) => {
      window.localStorage.setItem("zupulse-shell", nextShell);
      window.localStorage.setItem("zupulse-theme", nextTheme);
    },
    [shell, theme],
  );
  await page.goto("http://127.0.0.1:5173/#/library");
  await page.reload();
  const applied = await page.evaluate(() => [
    document.documentElement.dataset.shell,
    window.localStorage.getItem("zupulse-shell"),
  ]);
  if (applied[0] !== shell || applied[1] !== shell) throw new Error(`shell mismatch: ${applied}`);
}

async function openViewerFromLibrary() {
  await page.goto("http://127.0.0.1:5173/#/library");
  const openButton = page.getByRole("button", { name: /Cannon/ }).first();
  await openButton.waitFor({ state: "visible", timeout: 15000 });
  await openButton.click();
  await page.getByRole("region", { name: /播放控制|Playback controls/ }).waitFor({ state: "visible", timeout: 20000 });
  await page.waitForTimeout(600);
}

// Import a bundled sample once (IndexedDB persists across reloads in this context).
await page.goto("http://127.0.0.1:5173/#/library");
await page
  .getByRole("button", { name: /导入曲谱|Import score/ })
  .first()
  .click();
const useSample = page.getByRole("button", { name: /使用样例|Use sample/ }).first();
await useSample.waitFor({ state: "visible", timeout: 10000 });
await useSample.click();
await page.getByRole("button", { name: /^(导入|Import) 1$/ }).click();
await useSample.waitFor({ state: "hidden", timeout: 20000 });
await page
  .getByRole("button", { name: /Cannon/ })
  .first()
  .waitFor({ state: "visible", timeout: 20000 });
await page.keyboard.press("Escape");

for (const shell of ["classic", "device"]) {
  for (const theme of ["light", "dark"]) {
    await setShellTheme(shell, theme);
    await openViewerFromLibrary();
    await page.screenshot({ path: join(outDir, `viewer-${shell}-${theme}.png`), fullPage: false });
    if (shell === "device") {
      await page
        .getByRole("button", { name: /练习设置|Practice/ })
        .first()
        .click();
      await page.getByRole("complementary", { name: /练习设置|Practice/ }).waitFor({ state: "visible" });
      await page.waitForTimeout(300);
      await page.screenshot({ path: join(outDir, `viewer-device-${theme}-practice.png`), fullPage: false });
      await page.keyboard.press("Escape");
    }
  }
}

await browser.close();
console.log("captured:", outDir);
