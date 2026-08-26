export async function pickFiles(
  ownerDocument: Document,
  options: { accept: string; multiple: boolean },
): Promise<readonly File[]> {
  const input = ownerDocument.createElement("input");
  input.type = "file";
  input.multiple = options.multiple;
  input.accept = options.accept;
  // Detached file inputs fail to open the picker in some engines; keep the input in the DOM until settled.
  input.style.display = "none";
  ownerDocument.body.appendChild(input);
  try {
    return await new Promise<readonly File[]>((resolve) => {
      input.addEventListener("change", () => resolve(Array.from(input.files ?? [])), { once: true });
      input.addEventListener("cancel", () => resolve([]), { once: true });
      input.click();
    });
  } finally {
    input.remove();
  }
}

export function saveBytes(
  ownerDocument: Document,
  options: { fileName: string; bytes: Uint8Array; mimeType?: string },
): void {
  const blobBytes = new Uint8Array(options.bytes.byteLength);
  blobBytes.set(options.bytes);
  const blob =
    options.mimeType === undefined ? new Blob([blobBytes]) : new Blob([blobBytes], { type: options.mimeType });
  const url = URL.createObjectURL(blob);
  const link = ownerDocument.createElement("a");
  link.href = url;
  link.download = options.fileName;
  // Detached anchors fail to trigger downloads in some engines.
  link.style.display = "none";
  ownerDocument.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking the blob URL synchronously after click() can abort the download; defer it briefly.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
