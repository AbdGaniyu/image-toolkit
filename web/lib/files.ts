/**
 * Which files the tools take, checked in the browser before anything is
 * uploaded. Mirrors the API's limits (api/uploads.py, api/codec.py) so a wrong
 * file gets a clear message without a wasted upload.
 */

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
/** Most images batch mode (resize, convert) takes at once. */
export const MAX_BATCH = 10;

/**
 * For <input accept>. `image/*` so phones offer the camera and photo library;
 * HEIC is listed because some browsers give it no MIME type.
 */
export const ACCEPT = "image/*,.heic,.heif";

const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/pjpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);
const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|heic|heif)$/i;

export function isSupportedImage(file: File): boolean {
  const type = file.type.toLowerCase();
  if (IMAGE_TYPES.has(type)) return true;
  // HEIC often arrives with an empty or generic type; go by the extension then.
  return (type === "" || type === "application/octet-stream") && IMAGE_EXTENSIONS.test(file.name);
}

/**
 * Splits picked, dropped or pasted files into the ones to use (at most `max`)
 * and messages for the rest, e.g. "notes.pdf isn't a JPG, PNG, WEBP or HEIC image."
 */
export function checkFiles(files: File[], max = 1): { accepted: File[]; rejected: string[] } {
  const accepted: File[] = [];
  const rejected: string[] = [];
  for (const file of files) {
    const name = file.name || "The pasted image";
    if (!isSupportedImage(file)) {
      rejected.push(`${name} isn’t a JPG, PNG, WEBP or HEIC image.`);
    } else if (file.size === 0) {
      rejected.push(`${name} is empty.`);
    } else if (file.size > MAX_UPLOAD_BYTES) {
      rejected.push(`${name} is ${formatBytes(file.size)}; images must be 15 MB or smaller.`);
    } else if (accepted.length >= max) {
      rejected.push(
        max === 1
          ? `${name} wasn’t used: one image at a time.`
          : `${name} wasn’t added: up to ${max} images at a time.`,
      );
    } else {
      accepted.push(file);
    }
  }
  return { accepted, rejected };
}

/** The parts of a DataTransfer (drop) or clipboard (paste) this needs. */
export type TransferLike = {
  files?: ArrayLike<File> | null;
  items?: ArrayLike<{ kind: string; getAsFile(): File | null }> | null;
};

/** Files carried by a drop or paste. Some browsers expose pasted images only through `items`. */
export function filesFromTransfer(transfer: TransferLike | null | undefined): File[] {
  if (!transfer) return [];
  const files = Array.from(transfer.files ?? []);
  if (files.length > 0) return files;
  return Array.from(transfer.items ?? [])
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);
}

/** 812 B, 340 KB, 2.4 MB. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
