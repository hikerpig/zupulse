import { expect, test } from "@playwright/test";

const allowedProperties = new Set([
  "schema_version",
  "event_id",
  "distinct_id",
  "application_session_id",
  "occurred_at",
  "platform",
  "runtime",
  "app_version",
  "build_id",
  "release_channel",
  "effective_locale",
  "source",
  "outcome",
  "scoreFormat",
  "issueCode",
  "workspace",
  "navigationMode",
  "surface",
  "recoverable",
  "reason",
  "$process_person_profile",
  "$geoip_disable",
  "initialSurface",
  "state",
  "exception_name",
  "exception_message",
  "exception_fingerprint",
  "exception_stack",
  "handled",
  "operation",
]);

test("captures only allowlisted payloads and stops after opt-out", async ({ page }) => {
  const payloads: Array<{ event?: string; properties?: Record<string, unknown> }> = [];
  await page.route("https://us.i.posthog.com/capture/", async (route) => {
    payloads.push(JSON.parse(route.request().postData() ?? "{}"));
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  await page.goto("/#/library");
  await expect(page.getByRole("button", { name: "导入自己的曲谱" })).toBeVisible();
  await expect.poll(() => payloads.some(({ event }) => event === "application_session_started")).toBe(true);
  await expect(page.getByRole("link", { name: "了解详情" })).toHaveAttribute(
    "href",
    "https://zupulse.vercel.app/privacy.html",
  );

  for (const payload of payloads) {
    expect(Object.keys(payload.properties ?? {}).every((key) => allowedProperties.has(key))).toBe(true);
    expect(JSON.stringify(payload)).not.toMatch(/libraryScoreId|曲谱|标题|artist|fileName|127\.0\.0\.1/);
  }

  const firstLaunch = payloads.find(({ event }) => event === "application_session_started");
  expect(firstLaunch).toBeDefined();
  await page.getByRole("button", { name: "继续分享" }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "导入自己的曲谱" })).toBeVisible();
  await expect.poll(() => payloads.filter(({ event }) => event === "application_session_started").length).toBe(2);
  const launchEvents = payloads.filter(({ event }) => event === "application_session_started");
  expect(launchEvents[1]?.properties?.distinct_id).toBe(launchEvents[0]?.properties?.distinct_id);
  expect(launchEvents[1]?.properties?.application_session_id).not.toBe(
    launchEvents[0]?.properties?.application_session_id,
  );

  const initialCount = payloads.length;
  await page.getByRole("button", { name: "隐私与诊断" }).click();
  await page.getByRole("checkbox").uncheck();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name: "导入自己的曲谱" })).toBeVisible();
  expect(payloads).toHaveLength(initialCount);
});
