/**
 * Batch mode (resize and convert): up to 10 images, sent one at a time with
 * the same settings, then every result in a ZIP built in the browser.
 */

import { ApiError, type ApiResult, type Progress } from "./api";

export type ItemState =
  | { status: "queued" }
  | { status: "running"; progress: Progress }
  | { status: "done"; result: ApiResult }
  | { status: "error"; error: ApiError }
  | { status: "skipped" };

type Process = (
  file: File,
  options: { signal: AbortSignal; onProgress: (progress: Progress) => void },
) => Promise<ApiResult>;

/**
 * Runs `process` on files[i] for each index in turn, strictly one at a time,
 * reporting every change through onUpdate. A failure doesn't stop the batch;
 * aborting skips whatever hasn't finished.
 */
export async function processBatch(
  files: readonly File[],
  indices: readonly number[],
  process: Process,
  { signal, onUpdate }: { signal: AbortSignal; onUpdate: (index: number, state: ItemState) => void },
): Promise<void> {
  for (const index of indices) {
    if (signal.aborted) {
      onUpdate(index, { status: "skipped" });
      continue;
    }
    onUpdate(index, { status: "running", progress: { phase: "uploading", percent: 0 } });
    try {
      const result = await process(files[index], {
        signal,
        onProgress: (progress) => onUpdate(index, { status: "running", progress }),
      });
      onUpdate(index, { status: "done", result });
    } catch (error) {
      const apiError =
        error instanceof ApiError ? error : new ApiError("bad_response", "Something went wrong with this image.");
      onUpdate(index, apiError.code === "aborted" ? { status: "skipped" } : { status: "error", error: apiError });
    }
  }
}

/** Makes names unique, ignoring case as most file systems do: photo.jpg, photo (2).jpg. */
export function uniqueNames(names: readonly string[]): string[] {
  const used = new Set<string>();
  return names.map((name) => {
    const dot = name.lastIndexOf(".");
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const extension = dot > 0 ? name.slice(dot) : "";
    let candidate = name;
    for (let n = 2; used.has(candidate.toLowerCase()); n++) candidate = `${stem} (${n})${extension}`;
    used.add(candidate.toLowerCase());
    return candidate;
  });
}

/** A ZIP of the results, under the names the API gave them. JSZip is only loaded when this runs. */
export async function zipResults(results: readonly Pick<ApiResult, "blob" | "filename">[]): Promise<Blob> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const names = uniqueNames(results.map((result) => result.filename));
  for (const [index, result] of results.entries()) {
    zip.file(names[index], await result.blob.arrayBuffer());
  }
  // The images are already compressed: storing them is as small and much faster.
  return zip.generateAsync({ type: "blob", compression: "STORE", mimeType: "application/zip" });
}
