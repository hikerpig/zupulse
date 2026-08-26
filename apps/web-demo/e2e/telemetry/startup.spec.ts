import { expect, test } from "@playwright/test";

test("prints shell and workspace startup durations", async ({ page }) => {
  const payloads: Array<{ event?: string; properties?: Record<string, unknown> }> = [];
  await page.route("https://us.i.posthog.com/capture/", async (route) => {
    payloads.push(JSON.parse(route.request().postData() ?? "{}"));
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  const wallStartedAt = Date.now();
  await page.goto("/#/library");
  await expect(page.getByRole("button", { name: "导入自己的曲谱" })).toBeVisible();
  const wallClockToLibraryMs = Date.now() - wallStartedAt;
  await expect
    .poll(() => payloads.find(({ event }) => event === "application_ready")?.properties?.durationMs)
    .toEqual(expect.any(Number));
  await page.getByRole("button", { name: "继续分享" }).click();
  await page.getByRole("button", { name: "导入自己的曲谱", exact: true }).click();
  await page.getByRole("button", { name: "使用样例 Cannon in D" }).click();
  await page.getByRole("button", { name: "导入 1 份" }).click();
  await expect.poll(() => page.url()).toContain("#/viewer/");
  await expect
    .poll(() => payloads.find(({ event }) => event === "workspace_session_started")?.properties?.durationMs)
    .toEqual(expect.any(Number));

  const shellReadyMs = payloads.find(({ event }) => event === "application_ready")?.properties?.durationMs;
  const workspaceReadyMs = payloads.find(({ event }) => event === "workspace_session_started")?.properties?.durationMs;
  console.log(
    `startup-lab platform=browser wallClockToLibraryMs=${wallClockToLibraryMs} application_ready.durationMs=${shellReadyMs} workspace_session_started.durationMs=${workspaceReadyMs}`,
  );
});
