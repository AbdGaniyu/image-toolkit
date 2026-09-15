"use client";

import { useState } from "react";
import type { ItemState } from "@/lib/batch";
import { formatBytes } from "@/lib/files";

export type QueueItem = { id: string; name: string; url: string; state: ItemState };

type Props = {
  items: readonly QueueItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDownloadAll: () => Promise<void>;
};

/** Resize and convert: the queued images with their status, and a ZIP of the results. */
export default function BatchBar({ items, activeId, onSelect, onAdd, onDownloadAll }: Props) {
  const [zipping, setZipping] = useState(false);
  const done = items.filter((item) => item.state.status === "done").length;
  const failed = items.filter((item) => item.state.status === "error").length;
  const running = items.some((item) => item.state.status === "running");
  let label = `${items.length} ${items.length === 1 ? "file" : "files"}`;
  if (done) label += `, ${done} done`;
  if (failed) label += `, ${failed} failed`;

  return (
    <div className="flex flex-col gap-3 border border-[var(--color-divider)] p-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="kicker" aria-live="polite">
          Queue &mdash; {label}
        </div>
        <button type="button" className="btn btn-ghost p-0" onClick={onAdd} disabled={running || items.length >= 10}>
          + Add files
        </button>
        <button
          type="button"
          className="btn btn-secondary ml-auto"
          disabled={done === 0 || running || zipping}
          onClick={async () => {
            setZipping(true);
            try {
              await onDownloadAll();
            } finally {
              setZipping(false);
            }
          }}
        >
          {zipping ? "Zipping…" : "Download all (.zip)"}
        </button>
      </div>
      <ul className="flex list-none gap-[2px] overflow-x-auto p-0 pb-1">
        {items.map((item) => {
          const active = item.id === activeId;
          const { text, strong } = statusOf(item.state);
          return (
            <li key={item.id} data-status={item.state.status} className="flex-none">
              <button
                type="button"
                onClick={() => onSelect(item.id)}
                aria-pressed={active}
                aria-label={`${item.name}: ${text}`}
                className="box-border block w-28 cursor-pointer border-2 p-1.5 text-left"
                style={{
                  background: active ? "var(--color-accent-100)" : "var(--color-surface)",
                  borderColor: active ? "var(--color-accent)" : "transparent",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.url} alt="" className="checker-sm block h-16 w-full object-cover" />
                <div className="mt-1 truncate text-[11px]">{item.name}</div>
                <div
                  className="text-[10px] tracking-[0.06em] uppercase"
                  style={{ color: strong ? "var(--color-accent-700)" : "var(--color-neutral-700)" }}
                >
                  {text}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function statusOf(state: ItemState): { text: string; strong: boolean } {
  switch (state.status) {
    case "queued":
      return { text: "Queued", strong: false };
    case "running":
      return {
        text: state.progress.phase === "uploading" ? `Uploading ${state.progress.percent}%` : "Processing",
        strong: false,
      };
    case "done":
      return { text: formatBytes(state.result.blob.size), strong: true };
    case "error":
      return { text: "Failed", strong: true };
    case "skipped":
      return { text: "Skipped", strong: false };
  }
}
