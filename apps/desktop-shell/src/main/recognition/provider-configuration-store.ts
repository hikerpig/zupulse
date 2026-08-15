import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { RecognitionProviderId } from "@zupulse/web-core";

const pathSchema = z.string().min(1);
const configurationSchema = z.discriminatedUnion("providerId", [
  z.object({ providerId: z.literal("audiveris"), executable: pathSchema }).strict(),
  z
    .object({
      providerId: z.literal("rokot"),
      llamaCli: pathSchema,
      model: pathSchema,
      visionProjector: pathSchema,
      python: pathSchema,
    })
    .strict(),
  z
    .object({
      providerId: z.literal("legato"),
      python: pathSchema,
      repository: pathSchema,
      model: pathSchema,
      baseModel: pathSchema,
    })
    .strict(),
  z
    .object({ providerId: z.literal("transcoda"), python: pathSchema, repository: pathSchema, checkpoint: pathSchema })
    .strict(),
]);
const documentSchema = z.object({ schemaVersion: z.literal("1.0.0"), configuration: configurationSchema }).strict();

export type RecognitionProviderConfiguration = z.infer<typeof configurationSchema>;

export class RecognitionProviderConfigurationStore {
  private readonly directory: string;

  constructor(userDataDirectory: string) {
    this.directory = path.join(userDataDirectory, "recognition-providers");
  }

  async load(providerId: RecognitionProviderId): Promise<RecognitionProviderConfiguration | undefined> {
    const filePath = this.filePath(providerId);
    try {
      return documentSchema.parse(JSON.parse(await readFile(filePath, "utf8"))).configuration;
    } catch (error) {
      if (isMissingFile(error)) return undefined;
      await rename(filePath, `${filePath}.${Date.now()}.corrupt`).catch(() => undefined);
      return undefined;
    }
  }

  async loadAll(): Promise<Partial<Record<RecognitionProviderId, RecognitionProviderConfiguration>>> {
    const entries = await Promise.all(
      (["audiveris", "rokot", "legato", "transcoda"] as const).map(
        async (providerId) => [providerId, await this.load(providerId)] as const,
      ),
    );
    return Object.fromEntries(
      entries.filter(
        (entry): entry is [RecognitionProviderId, RecognitionProviderConfiguration] => entry[1] !== undefined,
      ),
    );
  }

  async save(configuration: RecognitionProviderConfiguration): Promise<void> {
    const document = documentSchema.parse({ schemaVersion: "1.0.0", configuration });
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const temporaryPath = path.join(this.directory, `${configuration.providerId}.${randomUUID()}.tmp`);
    try {
      await writeFile(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600,
        flag: "wx",
      });
      await rename(temporaryPath, this.filePath(configuration.providerId));
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined);
      throw error;
    }
  }

  async clear(providerId: RecognitionProviderId): Promise<void> {
    await unlink(this.filePath(providerId)).catch((error: unknown) => {
      if (!isMissingFile(error)) throw error;
    });
  }

  private filePath(providerId: RecognitionProviderId): string {
    return path.join(this.directory, `${providerId}.json`);
  }
}

function isMissingFile(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
