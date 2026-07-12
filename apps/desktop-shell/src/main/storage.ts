import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

type RuntimeSchema<T> = { parse(value: unknown): T };

export class JsonStore<T> {
  private readonly chains = new Map<string, Promise<void>>();

  constructor(
    private readonly userData: string,
    private readonly category: "sidecars" | "resume",
    private readonly schema: RuntimeSchema<T>,
    private readonly warn: (code: "CORRUPT_PERSISTED_DATA") => void,
  ) {}

  async read(contentHash: string): Promise<T | undefined> {
    const file = this.path(contentHash);
    let source: string;
    try {
      source = await readFile(file, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }

    try {
      return this.schema.parse(JSON.parse(source));
    } catch {
      await rename(file, `${file}.${Date.now()}.corrupt`);
      this.warn("CORRUPT_PERSISTED_DATA");
      return undefined;
    }
  }

  write(contentHash: string, value: T): Promise<void> {
    const previous = this.chains.get(contentHash) ?? Promise.resolve();
    const operation = previous
      .catch(() => undefined)
      .then(async () => {
        const file = this.path(contentHash);
        const temp = `${file}.${randomUUID()}.tmp`;
        await mkdir(dirname(file), { recursive: true });
        try {
          const parsed = this.schema.parse(value);
          await writeFile(temp, JSON.stringify(parsed, null, 2), { mode: 0o600 });
          await rename(temp, file);
        } finally {
          await rm(temp, { force: true });
        }
      });
    this.chains.set(contentHash, operation);
    return operation.finally(() => {
      if (this.chains.get(contentHash) === operation) this.chains.delete(contentHash);
    });
  }

  async delete(key: string): Promise<void> {
    await rm(this.path(key), { force: true });
  }

  private path(key: string): string {
    if (!/^(?:[a-f0-9]{64}|[a-f0-9-]{36})$/i.test(key)) throw new Error("INVALID_CONTENT_HASH");
    return join(this.userData, this.category, `${key}.json`);
  }
}
