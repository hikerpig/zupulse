import { randomUUID } from "node:crypto";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { LocalePreference } from "@zupulse/app-i18n";

const preferenceDocumentSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    localePreference: z.enum(["system", "zh-CN", "en-US"]),
  })
  .strict();

export class LocalePreferenceStore {
  private readonly filePath: string;

  constructor(private readonly userDataDirectory: string) {
    this.filePath = path.join(userDataDirectory, "preferences.json");
  }

  async load(): Promise<LocalePreference> {
    let source: string;
    try {
      source = await readFile(this.filePath, "utf8");
    } catch {
      return "system";
    }

    try {
      return preferenceDocumentSchema.parse(JSON.parse(source)).localePreference;
    } catch {
      await this.quarantineCorruptFile();
      return "system";
    }
  }

  async save(preference: LocalePreference): Promise<void> {
    const document = preferenceDocumentSchema.parse({
      schemaVersion: "1.0.0",
      localePreference: preference,
    });
    const temporaryPath = path.join(this.userDataDirectory, `preferences.json.${randomUUID()}.tmp`);
    try {
      await writeFile(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600,
        flag: "wx",
      });
      await rename(temporaryPath, this.filePath);
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined);
      throw error;
    }
  }

  private async quarantineCorruptFile(): Promise<void> {
    try {
      await rename(this.filePath, `${this.filePath}.${Date.now()}.corrupt`);
    } catch {
      // Startup remains available even when the corrupt file cannot be isolated.
    }
  }
}
