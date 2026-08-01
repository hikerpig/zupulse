import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const outDir = join(root, "screenshots", "piano-keys");
await mkdir(outDir, { recursive: true });

const fixture = join(root, "..", "test-fixtures", "musicxml", "K331-3_reviewed.mxl");
const baseURL = process.env.DEMO_URL ?? "http://127.0.0.1:5173";

const browser = await chromium.launch();

async function capture(theme) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    locale: "zh-CN",
  });
  const page = await context.newPage();
  await page.goto(`${baseURL}/#/library`);
  await page.waitForTimeout(1500);
  await page.evaluate((next) => {
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem("zupulse-theme", next);
  }, theme);
  await page.getByRole("button", { name: "导入自己的曲谱", exact: true }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /选择文件|Choose or drop files/ }).click();
  await (await chooser).setFiles(fixture);
  await page.getByText(/K331-3_reviewed/).waitFor({ timeout: 30000 });
  await page.getByRole("button", { name: /导入 1 份|Import 1/ }).click();
  const onViewer = () => window.location.hash.includes("#/viewer/");
  try {
    await page.waitForFunction(onViewer, null, { timeout: 15000 });
  } catch {
    // Import occasionally completes without auto-navigation; open the score from the library instead.
    await page.getByText("Piano Sonata no. 11 in A major").first().click();
    await page.waitForFunction(onViewer, null, { timeout: 15000 });
  }
  await page.waitForTimeout(3000);

  // Toggle the key guide from the transport quick button
  const keyGuideToggle = page.getByRole("button", { name: /^(琴键引导|Key guide)$/ });
  await keyGuideToggle.waitFor();
  await page
    .screenshot({ path: join(outDir, `transport-${theme}.png`), clip: { x: 0, y: 820, width: 1440, height: 80 } })
    .catch(() => page.screenshot({ path: join(outDir, `transport-${theme}.png`) }));
  await keyGuideToggle.click();

  const visualization = page.getByRole("region", { name: /琴键引导|Key guide/ });
  await visualization.waitFor();
  // Start playback so hints are on screen
  await page.getByRole("button", { name: "播放" }).click();
  await page.waitForTimeout(1800);
  await visualization.screenshot({ path: join(outDir, `visualization-${theme}.png`) });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(outDir, `full-${theme}.png`) });
  await context.close();
}

for (const theme of ["light", "dark"]) {
  await capture(theme);
}
await browser.close();
console.log("captured:", outDir);
