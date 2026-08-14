import { randomUUID } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { telemetryPreferenceStateSchema, type TelemetryPreferenceState } from "@zupulse/web-core";

export type DesktopTelemetryHandshake = {
  schemaVersion: 1;
  enabled: boolean;
  noticeAcknowledged: boolean;
  installationId?: string;
  applicationSessionId?: string;
};

const disabledState = (): TelemetryPreferenceState => ({
  schemaVersion: 1,
  enabled: false,
  noticeAcknowledged: false,
});

export class TelemetryPreferenceStore {
  private readonly filePath: string;
  private state: TelemetryPreferenceState = disabledState();
  private readonly applicationSessionId = randomUUID();

  constructor(private readonly userDataDirectory: string) {
    this.filePath = path.join(userDataDirectory, "telemetry-preferences.json");
  }

  async load(): Promise<DesktopTelemetryHandshake> {
    let source: string;
    try {
      source = await readFile(this.filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        this.state = { schemaVersion: 1, enabled: true, noticeAcknowledged: false, installationId: randomUUID() };
        await this.persist(this.state);
        return this.handshake();
      }
      this.state = disabledState();
      return this.handshake();
    }

    try {
      this.state = telemetryPreferenceStateSchema.parse(JSON.parse(source));
    } catch {
      await this.quarantineCorruptFile();
      this.state = disabledState();
    }
    if (this.state.enabled && !this.state.installationId) {
      this.state = { ...this.state, installationId: randomUUID() };
      await this.persist(this.state);
    }
    return this.handshake();
  }

  getState(): TelemetryPreferenceState {
    return this.state;
  }

  getHandshake(): DesktopTelemetryHandshake {
    return this.handshake();
  }

  async setPreference(enabled: boolean): Promise<DesktopTelemetryHandshake> {
    const next: TelemetryPreferenceState =
      enabled && this.state.enabled
        ? { ...this.state, noticeAcknowledged: true }
        : enabled
          ? {
              schemaVersion: 1,
              enabled: true,
              noticeAcknowledged: true,
              installationId: randomUUID(),
            }
          : { schemaVersion: 1, enabled: false, noticeAcknowledged: true };
    await this.persist(next);
    this.state = next;
    return this.handshake();
  }

  private handshake(): DesktopTelemetryHandshake {
    return {
      schemaVersion: 1,
      enabled: this.state.enabled,
      noticeAcknowledged: this.state.noticeAcknowledged,
      ...(this.state.installationId === undefined ? {} : { installationId: this.state.installationId }),
      ...(this.state.enabled ? { applicationSessionId: this.applicationSessionId } : {}),
    };
  }

  private async persist(state: TelemetryPreferenceState): Promise<void> {
    const parsed = telemetryPreferenceStateSchema.parse(state);
    const temporaryPath = path.join(this.userDataDirectory, `telemetry-preferences.${randomUUID()}.tmp`);
    try {
      await writeFile(temporaryPath, `${JSON.stringify(parsed, null, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600,
        flag: "wx",
      });
      await rename(temporaryPath, this.filePath);
    } catch (error) {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
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
