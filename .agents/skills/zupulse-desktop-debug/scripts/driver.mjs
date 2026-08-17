// Long-lived Playwright Electron driver for Zupulse desktop-shell.
// Usage: node driver.mjs <workdir> [repoRoot]
//   <workdir>  — created if missing; holds userdata/, cmd/, res/, shots/, driver.pid, driver.ready
//   [repoRoot] — defaults to the repository containing this skill
// Drop JSON commands into <workdir>/cmd/<id>.json; results appear in <workdir>/res/<id>.json.
// Use cmd.mjs to send commands. Stop with SIGTERM/SIGINT (kill "$(cat <workdir>/driver.pid)").
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workdir = resolve(process.argv[2] ?? ".");
// Skill lives at <repo>/.agents/skills/zupulse-desktop-debug/scripts/driver.mjs.
const skillRepo = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../../..");
const repoRoot = process.argv[3] ?? skillRepo;
if (!existsSync(join(repoRoot, "apps/desktop-shell/package.json"))) {
  console.error(`repoRoot ${repoRoot} does not contain apps/desktop-shell; pass it as argv[3]`);
  process.exit(1);
}
const appDir = join(repoRoot, "apps/desktop-shell");
const cmdDir = join(workdir, "cmd");
const resDir = join(workdir, "res");
const shotsDir = join(workdir, "shots");
const userData = join(workdir, "userdata");
const pidFile = join(workdir, "driver.pid");
const readyFile = join(workdir, "driver.ready");
const windowClosedFile = join(workdir, "driver.window-closed");
for (const dir of [cmdDir, resDir, shotsDir, userData]) await mkdir(dir, { recursive: true });

await writeFile(pidFile, `${process.pid}\n`);

// @playwright/test must resolve from the repo (this script may live outside it).
const { _electron: electron } = createRequire(join(repoRoot, "package.json"))("@playwright/test");

// Requires `pnpm desktop:build` to have run (dist/main/main.cjs must exist).
let app;
try {
  app = await electron.launch({ args: [".", `--user-data-dir=${userData}`], cwd: appDir });
} catch (error) {
  await unlink(pidFile).catch(() => undefined);
  console.error(error);
  process.exit(1);
}
const page = await app.firstWindow();
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
      await page.goto(`zupulse://app/index.html${hash}`);
      await page.waitForFunction((expected) => location.hash === expected, hash);
      return { ok: true };
    }
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
      const locator = cmd.testId ? page.getByTestId(cmd.testId) : roleLocator(cmd);
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
    case "mockOpen":
      await app.evaluate(
        ({ dialog }, payload) => {
          dialog.__zupulseOriginalOpen ??= dialog.showOpenDialog;
          dialog.showOpenDialog = async () => {
            dialog.showOpenDialog = dialog.__zupulseOriginalOpen;
            if (payload.canceled) return { canceled: true, filePaths: [] };
            return { canceled: false, filePaths: payload.paths };
          };
        },
        { canceled: Boolean(cmd.canceled), paths: cmd.paths ?? [cmd.path] },
      );
      return { ok: true };
    case "mockSave":
      await app.evaluate(
        ({ dialog }, payload) => {
          dialog.__zupulseOriginalSave ??= dialog.showSaveDialog;
          dialog.showSaveDialog = async () => {
            dialog.showSaveDialog = dialog.__zupulseOriginalSave;
            if (payload.canceled) return { canceled: true };
            return { canceled: false, filePath: payload.path };
          };
        },
        { canceled: Boolean(cmd.canceled), path: cmd.path },
      );
      return { ok: true };
    case "unmock":
      await app.evaluate(({ dialog }) => {
        if (dialog.__zupulseOriginalOpen) dialog.showOpenDialog = dialog.__zupulseOriginalOpen;
        if (dialog.__zupulseOriginalSave) dialog.showSaveDialog = dialog.__zupulseOriginalSave;
      });
      return { ok: true };
    case "menuClick": {
      const found = await app.evaluate(({ BrowserWindow, Menu }, id) => {
        const item = Menu.getApplicationMenu()?.getMenuItemById(id);
        if (!item) return false;
        item.click(item, BrowserWindow.getAllWindows()[0], {});
        return true;
      }, cmd.id);
      if (!found) return { ok: false, error: `menu item ${cmd.id} not found` };
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
  await app.close().catch(() => undefined);
  process.exit(0);
}

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
