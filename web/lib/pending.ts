/**
 * Files dropped on the landing page, held while the user picks a tool. Module
 * state survives client-side navigation, so the tool page can take them.
 */

let pending: File[] = [];

export function setPendingFiles(files: File[]): void {
  pending = files;
}

/** The waiting files, once: taking them clears the hand-off. */
export function takePendingFiles(): File[] {
  const files = pending;
  pending = [];
  return files;
}
