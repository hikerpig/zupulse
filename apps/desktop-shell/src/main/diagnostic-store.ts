import { appendFile, mkdir, readFile, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

type DiagnosticStoreOptions = {
  maximumBytes?: number;
  retentionMs?: number;
  now?: () => Date;
};

export class DiagnosticStore {
  private chain = Promise.resolve();
  private readonly currentPath: string;
  private readonly previousPath: string;
  private readonly maximumBytes: number;
  private readonly retentionMs: number;
  private readonly now: () => Date;

  constructor(
    private readonly directory: string,
    options: DiagnosticStoreOptions = {},
  ) {
    this.currentPath = join(directory, "desktop.log");
    this.previousPath = join(directory, "desktop.log.1");
    this.maximumBytes = options.maximumBytes ?? 1024 * 1024;
    this.retentionMs = options.retentionMs ?? SEVEN_DAYS_MS;
    this.now = options.now ?? (() => new Date());
  }

  initialize(): Promise<void> {
    return this.enqueue(async () => {
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      const cutoff = this.now().getTime() - this.retentionMs;
      await Promise.all([
        this.removeIfOlderThan(this.previousPath, cutoff),
        this.removeIfOlderThan(this.currentPath, cutoff),
      ]);
    });
  }

  append(line: string): Promise<void> {
    return this.enqueue(async () => {
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      const currentBytes = await fileSize(this.currentPath);
      if (currentBytes > 0 && currentBytes + Buffer.byteLength(line) > this.maximumBytes) {
        await rm(this.previousPath, { force: true });
        await rename(this.currentPath, this.previousPath);
      }
      await appendFile(this.currentPath, line, { mode: 0o600 });
    });
  }

  snapshot(): Promise<string> {
    return this.enqueue(async () => {
      const [previous, current] = await Promise.all([
        readIfPresent(this.previousPath),
        readIfPresent(this.currentPath),
      ]);
      return previous + current;
    });
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.chain.catch(() => undefined).then(operation);
    this.chain = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async removeIfOlderThan(filePath: string, cutoff: number): Promise<void> {
    const info = await stat(filePath).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    });
    if (info && info.mtimeMs < cutoff) await rm(filePath);
  }
}

async function fileSize(filePath: string): Promise<number> {
  return stat(filePath)
    .then((info) => info.size)
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return 0;
      throw error;
    });
}

async function readIfPresent(filePath: string): Promise<string> {
  return readFile(filePath, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return "";
    throw error;
  });
}
