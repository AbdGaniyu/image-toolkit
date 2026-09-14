"use client";

import { useState } from "react";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/fields";
import type { ItemState } from "@/lib/batch";
import { formatBytes } from "@/lib/files";
import { useObjectUrl } from "@/lib/useObjectUrl";

type Props = {
  files: readonly File[];
  items: readonly ItemState[];
  running: boolean;
  /** Label of the settings button, for the hint before the first run. */
  action: string;
  onCancel: () => void;
  /** Reruns the images that failed for a reason worth retrying; null when there are none. */
  onRetry: (() => void) | null;
  onDownload: (index: number) => void;
  onDownloadAll: () => Promise<void>;
  onStartOver: () => void;
};

/** Batch mode: every image with its status, then per-image and ZIP downloads. */
export default function BatchList({
  files,
  items,
  running,
  action,
  onCancel,
  onRetry,
  onDownload,
  onDownloadAll,
  onStartOver,
}: Props) {
  const [zipping, setZipping] = useState(false);
  const [zipError, setZipError] = useState<string | null>(null);
  const count = (status: ItemState["status"]) => items.filter((item) => item.status === status).length;
  const done = count("done");
  const failed = count("error");
  const skipped = count("skipped");
  const finished = done + failed + skipped;
  const started = items.some((item) => item.status !== "queued");

  let summary = `${files.length} images. Adjust the settings, then press “${action}”.`;
  if (started) {
    summary = `${running ? finished : done} of ${files.length} done`;
    if (failed) summary += ` · ${failed} failed`;
    if (skipped && !running) summary += ` · ${skipped} skipped`;
  }

  const downloadAll = async () => {
    setZipping(true);
    setZipError(null);
    try {
      await onDownloadAll();
    } catch {
      setZipError("Couldn’t build the ZIP. Download the images one at a time instead.");
    } finally {
      setZipping(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <p aria-live="polite" className="text-sm text-ink-body">
          {summary}
        </p>
        {running && (
          <div
            role="progressbar"
            aria-label="Batch progress"
            aria-valuemin={0}
            aria-valuemax={files.length}
            aria-valuenow={finished}
            className="h-1.5 overflow-hidden rounded-full bg-sand"
          >
            <div
              className="h-full rounded-full bg-accent transition-[width]"
              style={{ width: `${(finished / files.length) * 100}%` }}
            />
          </div>
        )}
      </div>

      <ul className="flex flex-col divide-y divide-line-soft rounded-xl border border-line-soft">
        {files.map((file, index) => (
          <Row key={index} file={file} state={items[index]} onDownload={() => onDownload(index)} />
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-3">
        {running ? (
          <button type="button" onClick={onCancel} className={SECONDARY_BUTTON}>
            Cancel
          </button>
        ) : (
          <>
            <button type="button" onClick={onStartOver} className={SECONDARY_BUTTON}>
              New images
            </button>
            {onRetry && (
              <button type="button" onClick={onRetry} className={SECONDARY_BUTTON}>
                Try failed again
              </button>
            )}
            {done > 0 && (
              <button type="button" onClick={downloadAll} disabled={zipping} className={PRIMARY_BUTTON}>
                {zipping ? "Zipping…" : "Download all (ZIP)"}
              </button>
            )}
          </>
        )}
      </div>
      {zipError && (
        <p role="alert" className="text-sm text-down">
          {zipError}
        </p>
      )}
    </div>
  );
}

function Row({ file, state, onDownload }: { file: File; state: ItemState; onDownload: () => void }) {
  const url = useObjectUrl(state.status === "done" ? state.result.blob : file);
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  const name = state.status === "done" ? state.result.filename : file.name;

  return (
    <li data-status={state.status} className="flex items-center gap-3 p-3">
      <div className="checkerboard size-12 shrink-0 overflow-hidden rounded-lg border border-line-soft">
        {url && brokenUrl !== url && (
          // Object URLs can't go through next/image's optimiser.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="size-full object-cover" onError={() => setBrokenUrl(url)} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink" title={name}>
          {name}
        </p>
        <RowStatus file={file} state={state} />
      </div>
      {state.status === "done" && (
        <button
          type="button"
          onClick={onDownload}
          aria-label={`Download ${state.result.filename}`}
          className="shrink-0 text-sm text-accent underline underline-offset-4 hover:text-accent-hover"
        >
          Download
        </button>
      )}
    </li>
  );
}

function RowStatus({ file, state }: { file: File; state: ItemState }) {
  switch (state.status) {
    case "queued":
      return <p className="text-xs text-ink-meta">Waiting</p>;
    case "running":
      return (
        <p className="text-xs text-accent">
          {state.progress.phase === "uploading" ? `Uploading… ${state.progress.percent}%` : "Processing…"}
        </p>
      );
    case "done":
      return (
        <p className="font-mono text-xs text-ink-meta">
          {formatBytes(file.size)} → {formatBytes(state.result.blob.size)}
        </p>
      );
    case "error":
      return <p className="text-xs text-down">{state.error.message}</p>;
    case "skipped":
      return <p className="text-xs text-ink-meta">Skipped</p>;
  }
}
