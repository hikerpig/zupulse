import { randomUUID } from "node:crypto";

export type FileTokenEntry = {
  path: string;
  fileName: string;
  sizeBytes: number;
  identity?: { dev: number; ino: number; mtimeMs: number };
  expiresAt: number;
};

export class FileTokenStore {
  private readonly entries = new Map<string, FileTokenEntry>();

  constructor(
    private readonly options: { now: () => number; ttlMs: number } = {
      now: () => Date.now(),
      ttlMs: 60_000,
    },
  ) {}

  issue(
    path: string,
    metadata: { fileName: string; sizeBytes: number; identity?: { dev: number; ino: number; mtimeMs: number } },
  ): string {
    const token = randomUUID();
    this.entries.set(token, {
      path,
      ...metadata,
      expiresAt: this.options.now() + this.options.ttlMs,
    });
    return token;
  }

  consume(token: string): FileTokenEntry {
    const entry = this.entries.get(token);
    this.entries.delete(token);
    if (!entry || entry.expiresAt < this.options.now()) {
      throw new Error("FILE_TOKEN_INVALID");
    }
    return entry;
  }

  clear(): void {
    this.entries.clear();
  }
}
