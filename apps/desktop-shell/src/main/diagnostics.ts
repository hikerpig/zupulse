import { diagnosticEventSchema } from "@tab-viewer/web-core";
import { appendFile, mkdir, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";

export class DiagnosticLogger {
  private chain = Promise.resolve();

  constructor(
    private readonly directory: string,
    private readonly maxBytes = 1024 * 1024,
  ) {}

  async write(value: unknown): Promise<void> {
    const event = diagnosticEventSchema.parse(value);
    const operation = this.chain.catch(() => undefined).then(async () => {
      await mkdir(this.directory, { recursive: true });
      const current = join(this.directory, "desktop.log");
      const previous = join(this.directory, "desktop.log.1");
      const size = await stat(current).then(info => info.size).catch(() => 0);
      if (size >= this.maxBytes) {
        await rm(previous, { force: true });
        await rename(current, previous);
      }
      await appendFile(
        current,
        `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`,
        { mode: 0o600 },
      );
    });
    this.chain = operation;
    return operation;
  }
}
