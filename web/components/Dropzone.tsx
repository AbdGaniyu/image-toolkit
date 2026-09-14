"use client";

import { useCallback, useEffect, useId, useRef, useState, type DragEvent } from "react";
import { ACCEPT, checkFiles, filesFromTransfer, MAX_BATCH } from "@/lib/files";

type Props = {
  /**
   * Called with the files that passed the checks (never empty), plus messages
   * for any that didn't: once files are taken the page usually replaces the
   * zone, so it's the page's job to show those.
   */
  onFiles: (files: File[], rejected: string[]) => void;
  /** Most files taken at once: 1 for single-image tools, up to MAX_BATCH in batch mode. */
  max?: number;
  disabled?: boolean;
};

/**
 * Shared upload. Drag and drop, click or tap to choose (on phones that opens
 * the camera or photo library), or paste an image anywhere on the page.
 */
export default function Dropzone({ onFiles, max = 1, disabled = false }: Props) {
  const inputId = useId();
  const [dragging, setDragging] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const dragDepth = useRef(0); // dragenter/dragleave also fire for child elements
  const limit = Math.min(max, MAX_BATCH);

  const take = useCallback(
    (files: File[]) => {
      if (disabled || files.length === 0) return;
      const { accepted, rejected } = checkFiles(files, limit);
      setProblems(accepted.length > 0 ? [] : rejected);
      if (accepted.length > 0) onFiles(accepted, rejected);
    },
    [disabled, limit, onFiles],
  );

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const files = filesFromTransfer(event.clipboardData);
      if (files.length === 0) return; // text: leave it to whichever field has focus
      event.preventDefault();
      take(files);
    };
    // A file dropped beside the zone would otherwise open in the tab and lose the page.
    const ignoreStrayDrop = (event: globalThis.DragEvent) => {
      if (!event.dataTransfer?.types.includes("Files")) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "none";
    };
    window.addEventListener("paste", onPaste);
    window.addEventListener("dragover", ignoreStrayDrop);
    window.addEventListener("drop", ignoreStrayDrop);
    return () => {
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("dragover", ignoreStrayDrop);
      window.removeEventListener("drop", ignoreStrayDrop);
    };
  }, [take]);

  const hasFiles = (event: DragEvent) => event.dataTransfer.types.includes("Files");

  const onDragEnter = (event: DragEvent) => {
    if (!hasFiles(event)) return;
    dragDepth.current += 1;
    setDragging(true);
  };
  const onDragLeave = () => {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };
  const onDragOver = (event: DragEvent) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    event.stopPropagation(); // keep ignoreStrayDrop from vetoing this one
    event.dataTransfer.dropEffect = disabled ? "none" : "copy";
  };
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepth.current = 0;
    setDragging(false);
    take(filesFromTransfer(event.dataTransfer));
  };

  const many = limit > 1;

  return (
    <div className="flex flex-col gap-3">
      <label
        htmlFor={inputId}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        data-dragging={dragging || undefined}
        aria-disabled={disabled || undefined}
        className={[
          "flex min-h-44 cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed",
          "border-line bg-paper px-6 py-10 text-center transition-colors sm:min-h-64",
          "hover:border-accent data-dragging:border-accent data-dragging:bg-accent-wash",
          "has-[input:focus-visible]:border-accent has-[input:focus-visible]:outline-2",
          "has-[input:focus-visible]:outline-offset-4 has-[input:focus-visible]:outline-accent",
          "aria-disabled:cursor-not-allowed aria-disabled:opacity-60 aria-disabled:hover:border-line",
        ].join(" ")}
      >
        <UploadIcon />
        <span className="font-display text-lg font-medium text-ink sm:text-xl">
          <span className="pointer-coarse:hidden">
            Drop {many ? "images" : "an image"} here, paste, or{" "}
            <span className="text-accent underline underline-offset-4">browse</span>
          </span>
          <span className="hidden pointer-coarse:inline">Tap to choose {many ? "photos" : "a photo"}</span>
        </span>
        <span className="text-sm text-ink-muted">
          JPG, PNG, WEBP or HEIC, up to 15 MB{many ? ` · up to ${limit} at once` : ""}
        </span>
        <input
          id={inputId}
          type="file"
          accept={ACCEPT}
          multiple={many}
          disabled={disabled}
          className="sr-only"
          onChange={(event) => {
            take(Array.from(event.target.files ?? []));
            event.target.value = ""; // choosing the same file again should still fire
          }}
        />
      </label>

      {problems.length > 0 && (
        <ul role="alert" className="flex flex-col gap-1 text-sm text-down">
          {problems.map((problem, index) => (
            <li key={index}>{problem}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function UploadIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-10 text-ink-faint"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7" />
      <path d="m3 16 5-5 4 4" />
      <path d="m14 14 1-1 6 6" />
      <path d="M18 9V3m-3 3 3-3 3 3" />
    </svg>
  );
}
