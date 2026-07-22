import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const outDir = join(root, "screenshots");
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 320 }, deviceScaleFactor: 2 });
const page = await context.newPage();

for (const theme of ["light", "dark"]) {
  await page.goto("http://127.0.0.1:5173/");
  await page.evaluate((next) => {
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem("zupulse-theme", next);
  }, theme);
  await page.waitForSelector("[data-testid='zupulse-logo-mark']");
  await page.waitForTimeout(150);
  await page.screenshot({ path: join(outDir, `header-${theme}.png`), fullPage: false });
}

await browser.close();
console.log("captured:", outDir);
