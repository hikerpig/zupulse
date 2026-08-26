import { expect, test, _electron as electron } from "@playwright/test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("prints shell and workspace startup durations", async () => {
  const userData = await mkdtemp(join(tmpdir(), "zupulse-e2e-startup-"));
  const payloads: Array<{ event?: string; properties?: Record<string, unknown> }> = [];
  await writeFile(
    join(userData, "preferences.json"),
    `${JSON.stringify({ schemaVersion: "1.0.0", localePreference: "en-US" }, null, 2)}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
  const wallStartedAt = Date.now();
  const app = await electron.launch({ args: [".", `--user-data-dir=${userData}`] });
  try {
    await app.context().route("https://us.i.posthog.com/capture/", async (route) => {
      payloads.push(JSON.parse(route.request().postData() ?? "{}"));
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });
    const page = await app.firstWindow();
    await expect(page.getByRole("button", { name: "Continue sharing" })).toBeVisible();
    const wallClockToChromeMs = Date.now() - wallStartedAt;
    await expect
      .poll(() => payloads.find(({ event }) => event === "application_ready")?.properties?.durationMs)
      .toEqual(expect.any(Number));
    await page.getByRole("button", { name: "Continue sharing" }).click();
    await page.getByRole("link", { name: "Library", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Score Library" })).toBeVisible();
    await page.getByRole("button", { name: "Import score", exact: true }).click();
    await page.getByRole("button", { name: "Use sample Cannon in D" }).click();
    await page.getByRole("button", { name: "Import 1" }).click();
    await expect.poll(() => page.url()).toContain("#/viewer/");
    await expect
      .poll(() => payloads.find(({ event }) => event === "workspace_session_started")?.properties?.durationMs)
      .toEqual(expect.any(Number));

    const shellReadyMs = payloads.find(({ event }) => event === "application_ready")?.properties?.durationMs;
    const workspaceReadyMs = payloads.find(({ event }) => event === "workspace_session_started")?.properties
      ?.durationMs;
    console.log(
      `startup-lab platform=desktop wallClockToChromeMs=${wallClockToChromeMs} application_ready.durationMs=${shellReadyMs} workspace_session_started.durationMs=${workspaceReadyMs}`,
    );
  } finally {
    await app.close().catch(() => undefined);
    await rm(userData, { recursive: true, force: true });
  }
});
