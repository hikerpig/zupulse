// Long-lived Playwright Chromium driver for Zupulse web-demo.
// Usage: node driver.mjs <workdir> [baseURL]
//   <workdir> — created if missing; holds browser-profile/, cmd/, res/, shots/, downloads/
//   [baseURL] — defaults to http://127.0.0.1:5173 (or DEMO_URL)
// Requires `pnpm demo:dev` (or an equivalent server) already serving baseURL.
// Drop JSON commands into <workdir>/cmd/<id>.json; results appear in <workdir>/res/<id>.json.
// Use cmd.mjs to send commands. Stop with SIGTERM/SIGINT (kill "$(cat <workdir>/driver.pid)").
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile, unlink } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workdir = resolve(process.argv[2] ?? ".");
const skillRepo = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../../..");
const repoRoot = process.env.ZUPULSE_REPO_ROOT ?? skillRepo;
if (!existsSync(join(repoRoot, "apps/web-demo/package.json"))) {
  console.error(`repoRoot ${repoRoot} does not contain apps/web-demo; set ZUPULSE_REPO_ROOT`);
  process.exit(1);
}
const baseURL = (process.argv[3] ?? process.env.DEMO_URL ?? "http://127.0.0.1:5173").replace(/\/$/, "");
const locale = process.env.WEB_DEBUG_LOCALE ?? "zh-CN";
const cmdDir = join(workdir, "cmd");
const resDir = join(workdir, "res");
const shotsDir = join(workdir, "shots");
const downloadsDir = join(workdir, "downloads");
const profileDir = join(workdir, "browser-profile");
const pidFile = join(workdir, "driver.pid");
const readyFile = join(workdir, "driver.ready");
const windowClosedFile = join(workdir, "driver.window-closed");
for (const dir of [cmdDir, resDir, shotsDir, downloadsDir, profileDir]) await mkdir(dir, { recursive: true });

await writeFile(pidFile, `${process.pid}\n`);

async function waitForDemo(url, attempts = 40) {
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status > 0) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`demo not reachable at ${url}; start with pnpm demo:dev and retry`);
}

const { chromium } = createRequire(join(repoRoot, "package.json"))("@playwright/test");

let context;
let page;
try {
  await waitForDemo(baseURL);
  context = await chromium.launchPersistentContext(profileDir, {
    headless: process.env.WEB_DEBUG_HEADED === "1" ? false : true,
    locale,
    viewport: { width: 1280, height: 720 },
    acceptDownloads: true,
  });
  page = context.pages()[0] ?? (await context.newPage());
} catch (error) {
  await unlink(pidFile).catch(() => undefined);
  console.error(error);
  process.exit(1);
}

page.setDefaultTimeout(15000);
page.on("close", () => {
  void writeFile(windowClosedFile, `${Date.now()}\n`);
});

async function only(locator, label) {
  const count = await locator.count();
  if (count !== 1) throw new Error(`${label}: expected 1 match, found ${count}`);
  return locator;
}

function roleLocator(cmd) {
  return page.getByRole(cmd.role, { name: cmd.name, exact: cmd.exact ?? false });
}

function textLocator(cmd) {
  return page.getByText(cmd.text, { exact: cmd.exact ?? false });
}

function resolveLocator(cmd) {
  if (cmd.testId) return page.getByTestId(cmd.testId);
  if (cmd.role && cmd.name) return roleLocator(cmd);
  throw new Error("locator requires testId or role+name");
}

async function execute(cmd) {
  switch (cmd.action) {
    case "shot":
      await page.screenshot({ path: join(shotsDir, `${cmd.name}.png`), fullPage: false });
      return { ok: true };
    case "shotFull":
      await page.screenshot({ path: join(shotsDir, `${cmd.name}.png`), fullPage: true });
      return { ok: true };
    case "nav": {
      const hash = cmd.hash.startsWith("#") ? cmd.hash : `#${cmd.hash}`;
      await page.goto(new URL(hash, `${baseURL}/`).href);
      await page.waitForFunction((expected) => location.hash === expected, hash);
      return { ok: true };
    }
    case "goto": {
      const target = cmd.url ?? new URL(cmd.path ?? "/", `${baseURL}/`).href;
      await page.goto(target);
      return { ok: true };
    }
    case "reload":
      await page.reload();
      return { ok: true };
    case "viewport":
      await page.setViewportSize({ width: cmd.width, height: cmd.height });
      return { ok: true };
    case "clickRole":
      await (await only(roleLocator(cmd), `clickRole ${cmd.role} ${cmd.name}`)).click();
      return { ok: true };
    case "clickTestId":
      await (await only(page.getByTestId(cmd.testId), `clickTestId ${cmd.testId}`)).click();
      return { ok: true };
    case "clickText":
      await (await only(textLocator(cmd), `clickText ${cmd.text}`)).click();
      return { ok: true };
    case "selectOption":
      await (
        await only(page.getByRole("combobox", { name: cmd.combobox }), `selectOption ${cmd.combobox}`)
      ).selectOption(cmd.value);
      return { ok: true };
    case "fill": {
      const locator = resolveLocator(cmd);
      await (await only(locator, `fill ${cmd.testId ?? `${cmd.role} ${cmd.name}`}`)).fill(cmd.value);
      return { ok: true };
    }
    case "press":
      if (cmd.role && cmd.name) {
        await (await only(roleLocator(cmd), `press ${cmd.role} ${cmd.name}`)).press(cmd.key);
      } else {
        await page.keyboard.press(cmd.key);
      }
      return { ok: true };
    case "chooseFiles": {
      const paths = cmd.paths ?? [cmd.path];
      const locator = resolveLocator(cmd);
      const chooserPromise = page.waitForEvent("filechooser");
      await (await only(locator, `chooseFiles`)).click();
      const chooser = await chooserPromise;
      await chooser.setFiles(paths);
      return { ok: true };
    }
    case "dropFiles": {
      const files = [];
      for (const entry of cmd.files) {
        const bytes = await readFile(entry.path);
        files.push({ name: entry.name ?? basename(entry.path), bytes: Array.from(bytes) });
      }
      const locator = resolveLocator(cmd);
      await (
        await only(locator, "dropFiles")
      ).evaluate((element, droppedFiles) => {
        const transfer = new DataTransfer();
        for (const file of droppedFiles) {
          transfer.items.add(new File([new Uint8Array(file.bytes)], file.name));
        }
        element.dispatchEvent(new DragEvent("dragenter", { bubbles: true, dataTransfer: transfer }));
        element.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
      }, files);
      return { ok: true };
    }
    case "downloadClick": {
      const locator = resolveLocator(cmd);
      const downloadPromise = page.waitForEvent("download", { timeout: cmd.timeoutMs ?? 15000 });
      await (await only(locator, `downloadClick`)).click();
      const download = await downloadPromise;
      const suggested = download.suggestedFilename();
      const saveAs = cmd.saveAs ?? suggested;
      const target = join(downloadsDir, saveAs);
      await download.saveAs(target);
      return { ok: true, path: target, suggestedFilename: suggested };
    }
    case "seedLocale": {
      await page.evaluate((next) => {
        if (next === "system") window.localStorage.removeItem("zupulse-locale");
        else window.localStorage.setItem("zupulse-locale", next);
      }, cmd.locale);
      await page.reload();
      return { ok: true };
    }
    case "seedTheme": {
      await page.evaluate((next) => {
        window.localStorage.setItem("zupulse-theme", next);
        document.documentElement.dataset.theme = next;
      }, cmd.theme);
      return { ok: true };
    }
    case "clearSiteData": {
      // CDP clears IndexedDB even when the page still holds an open connection;
      // plain indexedDB.deleteDatabase often hits onblocked and leaves scores behind.
      const session = await context.newCDPSession(page);
      await session.send("Storage.clearDataForOrigin", {
        origin: new URL(baseURL).origin,
        storageTypes: "all",
      });
      await session.detach().catch(() => undefined);
      await page.goto(new URL("#/library", `${baseURL}/`).href);
      return { ok: true };
    }
    case "bodyText":
      return { ok: true, text: (await page.locator("body").innerText()).slice(0, 6000) };
    case "waitText":
      await textLocator(cmd)
        .first()
        .waitFor({ timeout: cmd.timeoutMs ?? 15000 });
      return { ok: true };
    case "waitGone":
      await textLocator(cmd)
        .first()
        .waitFor({ state: "hidden", timeout: cmd.timeoutMs ?? 15000 });
      return { ok: true };
    case "wait":
      await new Promise((r) => setTimeout(r, cmd.ms));
      return { ok: true };
    case "eval":
      return { ok: true, value: await page.evaluate(cmd.js) };
    case "hash":
      return { ok: true, value: page.url() };
    default:
      return { ok: false, error: `unknown action ${cmd.action}` };
  }
}

async function failShot(id) {
  const name = `fail-${id}`;
  try {
    if (!page.isClosed()) await page.screenshot({ path: join(shotsDir, `${name}.png`), fullPage: false });
    return name;
  } catch {
    return undefined;
  }
}

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  await unlink(readyFile).catch(() => undefined);
  await unlink(pidFile).catch(() => undefined);
  await context.close().catch(() => undefined);
  process.exit(0);
}

await page.goto(`${baseURL}/`);
await writeFile(readyFile, `${process.pid}\n`);
console.log("driver-ready");

let busy = false;
setInterval(() => {
  if (busy || shuttingDown) return;
  busy = true;
  void (async () => {
    let files;
    try {
      files = (await readdir(cmdDir)).filter((f) => f.endsWith(".json"));
    } catch {
      return;
    }
    for (const file of files) {
      const cmdPath = join(cmdDir, file);
      const id = file.replace(/\.json$/, "");
      let result;
      try {
        const cmd = JSON.parse(await readFile(cmdPath, "utf8"));
        result = await execute(cmd);
        if (result.ok === false) {
          const shot = await failShot(id);
          if (shot) result.shot = shot;
        }
      } catch (error) {
        const shot = await failShot(id);
        result = { ok: false, error: String(error?.message ?? error) };
        if (shot) result.shot = shot;
      }
      await writeFile(join(resDir, `${id}.json`), JSON.stringify(result, null, 2));
      await unlink(cmdPath).catch(() => undefined);
    }
  })().finally(() => {
    busy = false;
  });
}, 400);

process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
