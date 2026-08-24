import { RecognitionJobStore } from "./job-store";
import type { RecognitionBlobStore } from "./recognition-service";

export async function reconcileRecognitionStorage(options: {
  store: RecognitionJobStore;
  objects: RecognitionBlobStore;
  now?: () => Date;
}): Promise<void> {
  for (const upload of options.store.listPendingUploads()) {
    await options.objects.delete([upload.inputObjectKey]);
    options.store.discardPendingUpload(upload.jobId);
  }

  const now = (options.now ?? (() => new Date()))().toISOString();
  for (const jobId of options.store.listMaintenanceJobIds(now)) {
    const keys = options.store.getObjectKeys(jobId);
    if (keys === undefined) continue;
    options.store.markDeletingForMaintenance(jobId, now);
    await options.objects.delete(keys);
    options.store.completeDelete(jobId);
  }
}
