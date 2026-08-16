/**
 * Reads window.localStorage defensively: access itself throws in some privacy modes.
 * Returns undefined when storage is unavailable; callers decide how to degrade.
 */
export function getLocalStorage(ownerDocument: Document): Storage | undefined {
  try {
    return ownerDocument.defaultView?.localStorage;
  } catch {
    return undefined;
  }
}
