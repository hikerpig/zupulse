import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url));
const pages = ["a-ep133-device.html", "b-op1-field.html", "c-opz-dark.html"];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 2 });
for (const file of pages) {
  await page.goto(`file://${path.join(dir, file)}`);
  await page.waitForTimeout(800);
  const out = path.join(dir, file.replace(".html", ".png"));
  await page.screenshot({ path: out });
  console.log("saved", out);
}
await browser.close();
