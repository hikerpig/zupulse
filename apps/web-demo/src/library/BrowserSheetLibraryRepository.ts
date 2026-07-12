import type {
  LibraryMetadata,
  LibraryScore,
  LibraryScoreId,
  LibraryScoreIdentity,
  LibraryScoreSummary,
  SheetLibraryRepository,
  StoredScoreFile,
  ValidatedLibraryScoreDraft,
  LocalPlaybackResume,
  SidecarPayload,
} from "@tab-viewer/web-core";

const DATABASE = "tab-viewer-library";
const VERSION = 1;
const SCORES = "library_scores";
const FILES = "score_files";
const SIDECARS = "practice_sidecars";
const RESUMES = "playback_resume";

type ScoreRecord = Omit<LibraryScore, "practice">;

export class BrowserSheetLibraryRepository implements SheetLibraryRepository {
  private database?: Promise<IDBDatabase>;
  private unavailable?: Error;

  async initialize(): Promise<void> {
    if (this.unavailable) throw this.unavailable;
    this.database ??= openDatabase();
    try {
      await this.database;
    } catch (error) {
      this.unavailable = error instanceof Error ? error : new Error("Library database is unavailable");
      throw this.unavailable;
    }
  }

  async list(): Promise<readonly LibraryScoreSummary[]> {
    const db = await this.getDatabase();
    const transaction = db.transaction([SCORES, SIDECARS, RESUMES], "readonly");
    const records = await request<ScoreRecord[]>(transaction.objectStore(SCORES).getAll());
    const sidecars = await request<{ id: string; payload: SidecarPayload }[]>(
      transaction.objectStore(SIDECARS).getAll(),
    );
    const resumes = await request<{ id: string; resume: LocalPlaybackResume }[]>(
      transaction.objectStore(RESUMES).getAll(),
    );
    await complete(transaction);
    const sidecarById = new Map(sidecars.map((item) => [item.id, item.payload]));
    const resumeById = new Map(resumes.map((item) => [item.id, item.resume]));
    return records.map((record) => toSummary(record, sidecarById.get(record.id), resumeById.get(record.id)));
  }

  async get(id: LibraryScoreId): Promise<LibraryScore | undefined> {
    const db = await this.getDatabase();
    const transaction = db.transaction(SCORES, "readonly");
    const record = await request<ScoreRecord | undefined>(transaction.objectStore(SCORES).get(id));
    await complete(transaction);
    return record && { ...record, practice: { hasLoop: false } };
  }

  async findByIdentity(identity: LibraryScoreIdentity): Promise<LibraryScore | undefined> {
    const db = await this.getDatabase();
    const transaction = db.transaction(SCORES, "readonly");
    const record = await request<ScoreRecord | undefined>(
      transaction.objectStore(SCORES).index("scoreIdentity").get(identity),
    );
    await complete(transaction);
    return record && { ...record, practice: { hasLoop: false } };
  }

  async add(draft: ValidatedLibraryScoreDraft): Promise<{ status: "created" | "existing"; score: LibraryScore }> {
    const db = await this.getDatabase();
    const transaction = db.transaction([SCORES, FILES, SIDECARS, RESUMES], "readwrite");
    const scores = transaction.objectStore(SCORES);
    const current = await request<ScoreRecord | undefined>(scores.index("scoreIdentity").get(draft.scoreIdentity));
    if (current) {
      await complete(transaction);
      return { status: "existing", score: { ...current, practice: { hasLoop: false } } };
    }
    const record: ScoreRecord = {
      id: draft.id,
      scoreIdentity: draft.scoreIdentity,
      fileName: draft.file.fileName,
      format: draft.format,
      title: draft.parsedTitle ?? titleFromFileName(draft.file.fileName),
      ...(draft.parsedArtist === undefined ? {} : { artist: draft.parsedArtist }),
      ...(draft.durationMs === undefined ? {} : { durationMs: draft.durationMs }),
      importedAt: draft.importedAt,
      isFavorite: false,
      metadata: {},
      ...(draft.parsedTitle === undefined ? {} : { parsedTitle: draft.parsedTitle }),
      ...(draft.parsedArtist === undefined ? {} : { parsedArtist: draft.parsedArtist }),
    };
    scores.add(record);
    transaction.objectStore(FILES).add({ id: draft.id, fileName: draft.file.fileName, bytes: draft.file.bytes });
    await complete(transaction);
    return { status: "created", score: { ...record, practice: { hasLoop: false } } };
  }

  async readScore(id: LibraryScoreId): Promise<StoredScoreFile> {
    const db = await this.getDatabase();
    const transaction = db.transaction(FILES, "readonly");
    const file = await request<StoredScoreFile | undefined>(transaction.objectStore(FILES).get(id));
    await complete(transaction);
    if (!file) throw new Error("Managed score file is missing");
    return { fileName: file.fileName, bytes: new Uint8Array(file.bytes) };
  }

  async updateMetadata(id: LibraryScoreId, patch: LibraryMetadata): Promise<LibraryScore> {
    const record = await this.require(id);
    const metadata = { ...record.metadata, ...patch };
    const artist = metadata.artistOverride ?? record.parsedArtist;
    const updated = {
      ...record,
      metadata,
      title: metadata.titleOverride ?? record.parsedTitle ?? titleFromFileName(record.fileName),
      ...(artist === undefined ? {} : { artist }),
    };
    const db = await this.getDatabase();
    const transaction = db.transaction(SCORES, "readwrite");
    transaction.objectStore(SCORES).put(updated);
    await complete(transaction);
    return { ...updated, practice: { hasLoop: false } };
  }

  async setFavorite(id: LibraryScoreId, favorite: boolean): Promise<void> {
    const record = await this.require(id);
    const db = await this.getDatabase();
    const transaction = db.transaction(SCORES, "readwrite");
    transaction.objectStore(SCORES).put({ ...record, isFavorite: favorite });
    await complete(transaction);
  }

  async markOpened(id: LibraryScoreId, openedAt: string): Promise<void> {
    const record = await this.require(id);
    const db = await this.getDatabase();
    const transaction = db.transaction(SCORES, "readwrite");
    transaction.objectStore(SCORES).put({ ...record, lastOpenedAt: openedAt });
    await complete(transaction);
  }

  async delete(id: LibraryScoreId): Promise<void> {
    const db = await this.getDatabase();
    const transaction = db.transaction([SCORES, FILES, SIDECARS, RESUMES], "readwrite");
    for (const store of [SCORES, FILES, SIDECARS, RESUMES]) transaction.objectStore(store).delete(id);
    await complete(transaction);
  }

  async readSidecar(id: LibraryScoreId): Promise<SidecarPayload | undefined> {
    return this.readPractice(SIDECARS, id, "payload");
  }
  async writeSidecar(id: LibraryScoreId, payload: SidecarPayload): Promise<void> {
    await this.writePractice(SIDECARS, id, "payload", payload);
  }
  async readResume(id: LibraryScoreId): Promise<LocalPlaybackResume | undefined> {
    return this.readPractice(RESUMES, id, "resume");
  }
  async writeResume(id: LibraryScoreId, resume: LocalPlaybackResume): Promise<void> {
    await this.writePractice(RESUMES, id, "resume", resume);
  }

  private async require(id: LibraryScoreId): Promise<ScoreRecord> {
    const score = await this.get(id);
    if (!score) throw new Error("Library score does not exist");
    const { practice: _practice, ...record } = score;
    return record;
  }
  private async readPractice<T>(store: string, id: LibraryScoreId, key: string): Promise<T | undefined> {
    const db = await this.getDatabase();
    const transaction = db.transaction(store, "readonly");
    const record = await request<Record<string, T> | undefined>(transaction.objectStore(store).get(id));
    await complete(transaction);
    return record?.[key];
  }
  private async writePractice<T>(store: string, id: LibraryScoreId, key: string, value: T): Promise<void> {
    const db = await this.getDatabase();
    const transaction = db.transaction([SCORES, store], "readwrite");
    if (!(await request<ScoreRecord | undefined>(transaction.objectStore(SCORES).get(id)))) {
      transaction.abort();
      throw new Error("LIBRARY_SCORE_NOT_FOUND");
    }
    transaction.objectStore(store).put({ id, [key]: value });
    await complete(transaction);
  }
  private async getDatabase(): Promise<IDBDatabase> {
    await this.initialize();
    return this.database!;
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DATABASE, VERSION);
    open.onupgradeneeded = () => {
      const db = open.result;
      const scores = db.objectStoreNames.contains(SCORES)
        ? open.transaction!.objectStore(SCORES)
        : db.createObjectStore(SCORES, { keyPath: "id" });
      if (!scores.indexNames.contains("scoreIdentity"))
        scores.createIndex("scoreIdentity", "scoreIdentity", { unique: true });
      if (!db.objectStoreNames.contains(FILES)) db.createObjectStore(FILES, { keyPath: "id" });
      if (!db.objectStoreNames.contains(SIDECARS)) db.createObjectStore(SIDECARS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(RESUMES)) db.createObjectStore(RESUMES, { keyPath: "id" });
    };
    open.onblocked = () => reject(new Error("Library database migration is blocked"));
    open.onsuccess = () => {
      open.result.onversionchange = () => open.result.close();
      resolve(open.result);
    };
    open.onerror = () => reject(open.error ?? new Error("Unable to open library database"));
  });
}
function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error);
  });
}
function complete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = transaction.onerror = () =>
      reject(transaction.error ?? new Error("Library transaction failed"));
  });
}
function titleFromFileName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "");
}
function toSummary(score: ScoreRecord, sidecar?: SidecarPayload, resume?: LocalPlaybackResume): LibraryScoreSummary {
  return {
    ...score,
    practice: {
      hasLoop: Boolean(sidecar?.practice.playback.loops.length),
      ...(resume === undefined ? {} : { lastPracticedAt: resume.updatedAt, lastPosition: resume.position }),
    },
  };
}
