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

for (const shell of ["classic", "device"]) {
  for (const theme of ["light", "dark"]) {
    await page.goto("http://127.0.0.1:5173/");
    await page.evaluate(
      ([nextShell, nextTheme]) => {
        document.documentElement.dataset.shell = nextShell;
        document.documentElement.dataset.theme = nextTheme;
        window.localStorage.setItem("zupulse-shell", nextShell);
        window.localStorage.setItem("zupulse-theme", nextTheme);
      },
      [shell, theme],
    );
    await page.reload();
    await page.waitForSelector("[data-testid='zupulse-logo-mark']");
    await page.waitForTimeout(150);
    const applied = await page.evaluate(() => document.documentElement.dataset.shell);
    if (applied !== shell) throw new Error(`expected shell ${shell}, got ${applied}`);
    await page.screenshot({ path: join(outDir, `shell-${shell}-${theme}.png`), fullPage: false });
  }
}

await browser.close();
console.log("captured:", outDir);
