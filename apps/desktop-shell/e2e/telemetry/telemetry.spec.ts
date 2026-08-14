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
  const app = await electron.launch({ args: [".", `--user-data-dir=${userData}`] });
  try {
    await app.context().route("https://us.i.posthog.com/capture/", async (route) => {
      payloads.push(JSON.parse(route.request().postData() ?? "{}"));
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });
    const page = await app.firstWindow();
    await expect(page.getByRole("button", { name: "Continue sharing" })).toBeVisible();
    await expect.poll(() => payloads.some(({ event }) => event === "application_session_started")).toBe(true);

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

    const initialCount = payloads.length;
    await page.getByRole("button", { name: "Continue sharing" }).click();
    await page.getByRole("button", { name: "Privacy & diagnostics" }).click();
    await page.getByRole("checkbox").click();
    await expect(page.getByRole("checkbox")).not.toBeChecked({ timeout: 10_000 });
    await expect(page.getByRole("alert")).toHaveCount(0);
    await page.reload();
    expect(payloads).toHaveLength(initialCount);
  } finally {
    await app.close().catch(() => undefined);
    await rm(userData, { recursive: true, force: true });
  }
});
