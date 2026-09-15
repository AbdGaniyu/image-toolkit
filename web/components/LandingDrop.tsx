"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, type DragEvent } from "react";
import InlineError from "@/components/InlineError";
import type { Endpoint } from "@/lib/api";
import { ACCEPT, checkFiles, filesFromTransfer, MAX_BATCH } from "@/lib/files";
import { setPendingFiles } from "@/lib/pending";
import { sampleFile } from "@/lib/sample";
import { TOOLS } from "@/lib/tools";

const CHOICES: readonly { slug: Endpoint; label: string }[] = [
  { slug: "remove-bg", label: "Remove background" },
  { slug: "resize", label: "Resize to preset" },
  { slug: "convert", label: "Convert & compress" },
  { slug: "watermark", label: "Watermark" },
];

/** The landing drop zone: drop, click, paste or use the sample, then pick a tool. */
export default function LandingDrop() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [waiting, setWaiting] = useState<File[] | null>(null);

  const take = useCallback((files: File[]) => {
    if (files.length === 0) return;
    const { accepted, rejected } = checkFiles(files, MAX_BATCH);
    setProblems(rejected);
    if (accepted.length > 0) setWaiting(accepted);
  }, []);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const files = filesFromTransfer(event.clipboardData);
      if (files.length === 0) return;
      event.preventDefault();
      take(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [take]);

  const pick = () => {
    if (!input.current) return;
    input.current.value = "";
    input.current.click();
  };

  const open = (slug: Endpoint) => {
    if (!waiting) return;
    setPendingFiles(waiting);
    router.push(`/${slug}`);
  };

  return (
    <>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => take(Array.from(event.target.files ?? []))}
      />
      <div
        onClick={pick}
        onDragOver={(event: DragEvent) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event: DragEvent) => {
          event.preventDefault();
          setDragging(false);
          take(filesFromTransfer(event.dataTransfer));
        }}
        className="flex cursor-pointer flex-wrap items-center gap-4 border-2 border-dashed border-[var(--color-divider)] p-[clamp(24px,4vw,40px)]"
        style={{ background: dragging ? "var(--color-accent-100)" : "transparent" }}
      >
        <svg aria-hidden="true" width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <path d="M7 10l5-5 5 5" />
          <path d="M12 5v12" />
        </svg>
        <div className="min-w-[200px] flex-1">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              pick();
            }}
            className="heading cursor-pointer text-left text-[21px]"
          >
            Drop an image to start
          </button>
          <div className="mt-0.5 text-[13px] opacity-75">
            JPG, PNG, WEBP or HEIC up to 15 MB. We&rsquo;ll ask which tool next.
          </div>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={async (event) => {
            event.stopPropagation();
            take([await sampleFile()]);
          }}
        >
          Use a sample photo
        </button>
      </div>

      {/* Phones: the design's full-width primary action, opening the camera or photo library. */}
      <button type="button" className="btn btn-primary btn-block mt-3 min-h-12 px-3 py-3.5 text-[15px] sm:hidden" onClick={pick}>
        Choose a photo
      </button>

      {problems.length > 0 && (
        <div className="mt-3">
          <InlineError message={problems.join(" ")} onDismiss={() => setProblems([])} />
        </div>
      )}

      {waiting && <ToolChooser files={waiting} onChoose={open} onCancel={() => setWaiting(null)} />}
    </>
  );
}

function ToolChooser({
  files,
  onChoose,
  onCancel,
}: {
  files: File[];
  onChoose: (slug: Endpoint) => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    first.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const what = files.length > 1 ? `${files.length} images ready` : files[0].name;
  const singleOnly = files.length > 1 ? TOOLS.filter((tool) => !tool.batchZipName).map((tool) => tool.slug) : [];

  return (
    <div className="dialog-backdrop z-[60]" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="dialog"
        style={{ width: "min(520px, 100%)" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div id={titleId} className="dialog-title">
          Which tool?
        </div>
        <div className="dialog-body">{what} — pick what to do with it.</div>
        <div className="grid grid-cols-2 gap-[2px] border-2 border-[var(--color-divider)] bg-[var(--color-divider)]">
          {CHOICES.map((choice, index) => (
            <button
              key={choice.slug}
              ref={index === 0 ? first : undefined}
              type="button"
              onClick={() => onChoose(choice.slug)}
              className="btn min-h-12 justify-start bg-[var(--color-surface)] p-3.5 text-left hover:bg-[var(--color-accent-100)]"
            >
              {choice.label}
              {singleOnly.includes(choice.slug) && (
                <span className="block text-[11px] font-normal opacity-70 [font-family:var(--font-body)]">first image only</span>
              )}
            </button>
          ))}
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
