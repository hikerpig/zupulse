import { expect, test, _electron as electron } from "@playwright/test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("captures allowlisted desktop events and stops after opt-out", async () => {
  const userData = await mkdtemp(join(tmpdir(), "zupulse-e2e-telemetry-"));
  const payloads: Array<{ event?: string; properties?: Record<string, unknown> }> = [];
  await writeFile(
    join(userData, "preferences.json"),
    `${JSON.stringify({ schemaVersion: "1.0.0", localePreference: "en-US" }, null, 2)}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
  let app = await electron.launch({ args: [".", `--user-data-dir=${userData}`] });
  try {
    await routeTelemetry(app, payloads);
    const page = await app.firstWindow();
    await expect(page.getByRole("button", { name: "Continue sharing" })).toBeVisible();
    await expect.poll(() => payloads.some(({ event }) => event === "application_session_started")).toBe(true);
    const firstLaunch = payloads.find(({ event }) => event === "application_session_started");
    expect(firstLaunch).toBeDefined();

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
      "initialSurface",
      "state",
      "scoreFormat",
      "issueCode",
      "workspace",
      "navigationMode",
      "source",
      "outcome",
      "surface",
      "recoverable",
      "reason",
      "exception_name",
      "exception_message",
      "exception_fingerprint",
      "exception_stack",
      "handled",
      "operation",
      "$process_person_profile",
      "$geoip_disable",
    ]);
    for (const payload of payloads) {
      expect(Object.keys(payload.properties ?? {}).every((key) => allowedProperties.has(key))).toBe(true);
      expect(JSON.stringify(payload)).not.toMatch(/libraryScoreId|score title|fileName|userData|127\.0\.0\.1/);
    }

    await page.getByRole("button", { name: "Continue sharing" }).click();
    await app.close();
    app = await electron.launch({ args: [".", `--user-data-dir=${userData}`] });
    await routeTelemetry(app, payloads);
    const relaunchedPage = await app.firstWindow();
    await expect(relaunchedPage.getByRole("button", { name: "Privacy & diagnostics" })).toBeVisible();
    await expect.poll(() => payloads.filter(({ event }) => event === "application_session_started").length).toBe(2);
    await expect.poll(() => payloads.filter(({ event }) => event === "application_ready").length).toBe(2);
    const launchEvents = payloads.filter(({ event }) => event === "application_session_started");
    expect(launchEvents[1]?.properties?.distinct_id).toBe(launchEvents[0]?.properties?.distinct_id);
    expect(launchEvents[1]?.properties?.application_session_id).not.toBe(
      launchEvents[0]?.properties?.application_session_id,
    );

    const initialCount = payloads.length;
    await relaunchedPage.getByRole("button", { name: "Privacy & diagnostics" }).click();
    await relaunchedPage.getByRole("checkbox").click();
    await expect(relaunchedPage.getByRole("checkbox")).not.toBeChecked({ timeout: 10_000 });
    await expect(relaunchedPage.getByRole("alert")).toHaveCount(0);
    await relaunchedPage.reload();
    expect(payloads).toHaveLength(initialCount);
  } finally {
    await app.close().catch(() => undefined);
    await rm(userData, { recursive: true, force: true });
  }
});

async function routeTelemetry(
  app: import("@playwright/test").ElectronApplication,
  payloads: Array<{ event?: string; properties?: Record<string, unknown> }>,
): Promise<void> {
  await app.context().route("https://us.i.posthog.com/capture/", async (route) => {
    payloads.push(JSON.parse(route.request().postData() ?? "{}"));
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
}
