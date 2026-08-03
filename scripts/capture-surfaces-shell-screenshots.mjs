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

// Import the bundled sample once (skip if it is already in the library).
await page.goto("http://127.0.0.1:5173/#/library");
const cannonButton = page.getByRole("button", { name: /Cannon/ }).first();
const alreadyImported = await cannonButton
  .waitFor({ state: "visible", timeout: 8000 })
  .then(() => true)
  .catch(() => false);
if (!alreadyImported) {
  await page
    .getByRole("button", { name: /导入曲谱|Import score/ })
    .first()
    .click();
  const useSample = page.getByRole("button", { name: /样例|sample/i }).first();
  await useSample.waitFor({ state: "visible", timeout: 10000 });
  await useSample.click();
  await page.getByRole("button", { name: /^(导入|Import) 1$/ }).click();
  await useSample.waitFor({ state: "hidden", timeout: 20000 });
  // Import auto-opens the score in the Viewer; return to the library first.
  await page.goto("http://127.0.0.1:5173/#/library");
}
await cannonButton.waitFor({ state: "visible", timeout: 30000 });

for (const theme of ["light", "dark"]) {
  await setShellTheme("device", theme);
  await page.goto("http://127.0.0.1:5173/#/library");
  await page
    .getByRole("button", { name: /Cannon/ })
    .first()
    .waitFor({ state: "visible", timeout: 15000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(outDir, `library-device-${theme}.png`), fullPage: false });

  // Studio surface
  await page
    .getByRole("button", { name: /Cannon/ })
    .first()
    .click();
  await page.getByRole("region", { name: /播放控制|Playback controls/ }).waitFor({ state: "visible", timeout: 20000 });
  const studioMarker = page.getByText(/CHORD WORKSPACE|CHORD INSPECTOR|和弦工作区/i).first();
  for (let attempt = 0; attempt < 3; attempt++) {
    await page
      .getByRole("link", { name: /Harmony Studio|和弦工作室|和弦分析/ })
      .first()
      .click();
    const reached = await studioMarker
      .waitFor({ state: "visible", timeout: 15000 })
      .then(() => true)
      .catch(() => false);
    if (reached) break;
    if (attempt === 2) throw new Error(`studio navigation failed for ${theme}`);
  }
  await page.waitForTimeout(12000);
  await page.screenshot({ path: join(outDir, `studio-device-${theme}.png`), fullPage: false });
}

await browser.close();
console.log("captured:", outDir);
