import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { DeleteObjectsCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { RecognitionObjectStore } from "./recognition-worker";

type S3Command = DeleteObjectsCommand | GetObjectCommand | PutObjectCommand;
type S3Send = (command: S3Command) => Promise<unknown>;

export class S3RecognitionObjectStore implements RecognitionObjectStore {
  private readonly bucket: string;
  private readonly send: S3Send;

  constructor(options: { bucket: string; send: S3Send }) {
    this.bucket = options.bucket;
    this.send = options.send;
  }

  async materialize(key: string, destinationPath: string, expectedSha256: string): Promise<void> {
    const bytes = await this.getBytes(key, expectedSha256);
    await writeFile(destinationPath, bytes, { flag: "wx" });
  }

  async putFile(key: string, sourcePath: string, expectedSha256: string): Promise<{ sizeBytes: number }> {
    const bytes = new Uint8Array(await readFile(sourcePath));
    assertHash(bytes, expectedSha256);
    await this.putBytes(key, bytes);
    return { sizeBytes: bytes.byteLength };
  }

  async putBytes(key: string, bytes: Uint8Array): Promise<void> {
    assertObjectKey(key);
    await this.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: bytes }));
  }

  async getBytes(key: string, expectedSha256: string): Promise<Uint8Array> {
    assertObjectKey(key);
    const response = (await this.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }))) as {
      Body?: { transformToByteArray(): Promise<Uint8Array> };
    };
    if (response.Body === undefined) throw new RecognitionObjectStoreError("STORAGE_UNAVAILABLE");
    const bytes = new Uint8Array(await response.Body.transformToByteArray());
    if (bytes.byteLength > 64 * 1024 * 1024) throw new RecognitionObjectStoreError("FILE_TOO_LARGE");
    assertHash(bytes, expectedSha256);
    return bytes;
  }

  async delete(keys: readonly string[]): Promise<void> {
    if (keys.length === 0) return;
    for (const key of keys) assertObjectKey(key);
    await this.send(
      new DeleteObjectsCommand({
        Bucket: this.bucket,
        Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
      }),
    );
  }
}

export function createS3RecognitionObjectStore(options: {
  bucket: string;
  endpoint?: string;
  region: string;
  forcePathStyle?: boolean;
}): S3RecognitionObjectStore {
  const client = new S3Client({
    region: options.region,
    ...(options.endpoint === undefined ? {} : { endpoint: options.endpoint }),
    ...(options.forcePathStyle === undefined ? {} : { forcePathStyle: options.forcePathStyle }),
  });
  return new S3RecognitionObjectStore({ bucket: options.bucket, send: (command) => client.send(command as never) });
}

export class RecognitionObjectStoreError extends Error {
  constructor(readonly code: "FILE_TOO_LARGE" | "RESULT_INTEGRITY_FAILED" | "STORAGE_UNAVAILABLE") {
    super(code);
  }
}

function assertHash(bytes: Uint8Array, expectedSha256: string): void {
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== expectedSha256) throw new RecognitionObjectStoreError("RESULT_INTEGRITY_FAILED");
}

function assertObjectKey(key: string): void {
  if (!/^jobs\/[a-zA-Z0-9-]{1,128}\/(input\.(pdf|png|jpg)|result\.(mxl|json))$/.test(key)) {
    throw new RecognitionObjectStoreError("STORAGE_UNAVAILABLE");
  }
}
