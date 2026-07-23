import type {
  LibraryScoreId,
  LocalPlaybackResume,
  PlaybackPersistence,
  ScoreIdentity,
  SidecarPayload,
} from "@zupulse/web-core";
import type { IndexedDbSheetLibraryRepository } from "@zupulse/web-storage";

export class IpadLibraryPlaybackPersistence implements PlaybackPersistence {
  constructor(
    private readonly repository: IndexedDbSheetLibraryRepository,
    private readonly libraryScoreId?: LibraryScoreId,
  ) {}

  forLibraryScore(id: LibraryScoreId): IpadLibraryPlaybackPersistence {
    return new IpadLibraryPlaybackPersistence(this.repository, id);
  }

  async readSidecar(_identity: ScoreIdentity): Promise<SidecarPayload | undefined> {
    return this.libraryScoreId === undefined ? undefined : this.repository.readSidecar(this.libraryScoreId);
  }

  async writeSidecar(_identity: ScoreIdentity, payload: SidecarPayload): Promise<void> {
    if (this.libraryScoreId) await this.repository.writeSidecar(this.libraryScoreId, payload);
  }

  async readResume(_identity: ScoreIdentity): Promise<LocalPlaybackResume | undefined> {
    return this.libraryScoreId === undefined ? undefined : this.repository.readResume(this.libraryScoreId);
  }

  async writeResume(_identity: ScoreIdentity, resume: LocalPlaybackResume): Promise<void> {
    if (this.libraryScoreId) await this.repository.writeResume(this.libraryScoreId, resume);
  }
}
