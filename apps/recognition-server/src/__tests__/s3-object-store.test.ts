import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { S3RecognitionObjectStore } from "../s3-object-store";

describe("S3RecognitionObjectStore", () => {
  it("verifies downloaded and uploaded bytes instead of trusting ETags", async () => {
    const directory = await mkdtemp(join(tmpdir(), "zupulse-recognition-s3-"));
    const source = join(directory, "source.pdf");
    const destination = join(directory, "destination.pdf");
    const bytes = new TextEncoder().encode("%PDF-1.7");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    await writeFile(source, bytes);
    const commands: string[] = [];
    const objects = new S3RecognitionObjectStore({
      bucket: "scores",
      send: async (command) => {
        commands.push(command.constructor.name);
        if (command.constructor.name === "GetObjectCommand") {
          return { Body: { transformToByteArray: async () => bytes } };
        }
        return { ETag: "not-an-application-hash" };
      },
    });

    await objects.materialize("jobs/job-1/input.pdf", destination, sha256);
    expect(await readFile(destination, "utf8")).toBe("%PDF-1.7");
    await expect(objects.putFile("jobs/job-1/result.mxl", source, sha256)).resolves.toEqual({
      sizeBytes: bytes.byteLength,
    });
    expect(commands).toEqual(["GetObjectCommand", "PutObjectCommand"]);
  });

  it("rejects hash-mismatched objects", async () => {
    const directory = await mkdtemp(join(tmpdir(), "zupulse-recognition-s3-"));
    const objects = new S3RecognitionObjectStore({
      bucket: "scores",
      send: async () => ({ Body: { transformToByteArray: async () => new TextEncoder().encode("wrong") } }),
    });

    await expect(
      objects.materialize("jobs/job-1/input.pdf", join(directory, "input.pdf"), "a".repeat(64)),
    ).rejects.toThrow("RESULT_INTEGRITY_FAILED");
  });
});
