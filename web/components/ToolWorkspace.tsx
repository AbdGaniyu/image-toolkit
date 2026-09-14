"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import BatchList from "@/components/BatchList";
import BeforeAfter from "@/components/BeforeAfter";
import Dropzone from "@/components/Dropzone";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/fields";
import { ApiError, processImage, type ApiResult, type Params, type Progress } from "@/lib/api";
import { processBatch, zipResults, type ItemState } from "@/lib/batch";
import { saveBlob } from "@/lib/download";
import { formatBytes, MAX_BATCH } from "@/lib/files";
import type { Built } from "@/lib/params";
import type { Tool } from "@/lib/tools";
import { useObjectUrl } from "@/lib/useObjectUrl";

type Run =
  | { status: "idle" }
  | { status: "running"; progress: Progress }
  | { status: "done"; result: ApiResult; params: Params }
  | { status: "error"; error: ApiError; params: Params };

type Props = {
  tool: Tool;
  /** The tool's settings form. */
  options: ReactNode;
  /** The current settings as API params, or what's missing. */
  buildParams: () => Built;
  /** Start as soon as an image is chosen (for tools whose defaults are all you need). */
  autoRun?: boolean;
};

/**
 * One tool page's working area. One image: see it straight away, run the tool
 * with progress, compare before/after, download. Several (batch tools only):
 * run them one at a time, download each or all as a ZIP.
 */
export default function ToolWorkspace({ tool, options, buildParams, autoRun = false }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const single = files.length === 1 ? files[0] : null;
  const isBatch = files.length > 1;

  const [run, setRun] = useState<Run>({ status: "idle" });
  const [items, setItems] = useState<ItemState[]>([]);
  const [batchParams, setBatchParams] = useState<Params | null>(null);
  const [batchRunning, setBatchRunning] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  /** Dropped or picked files that weren't taken (wrong type, too big, over the limit). */
  const [notices, setNotices] = useState<string[]>([]);
  const [resultSize, setResultSize] = useState<[number, number] | null>(null);
  const originalUrl = useObjectUrl(single);
  const resultUrl = useObjectUrl(run.status === "done" ? run.result.blob : null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  const start = useCallback(
    async (image: File, params: Params) => {
      controller.current?.abort();
      const current = new AbortController();
      controller.current = current;
      setResultSize(null);
      setRun({ status: "running", progress: { phase: "uploading", percent: 0 } });
      try {
        const result = await processImage(tool.slug, image, params, {
          signal: current.signal,
          onProgress: (progress) => {
            if (controller.current === current) setRun({ status: "running", progress });
          },
        });
        if (controller.current === current) setRun({ status: "done", result, params });
      } catch (error) {
        if (controller.current !== current) return; // a newer run took over
        const apiError =
          error instanceof ApiError ? error : new ApiError("bad_response", "Something went wrong. Try again.");
        setRun(apiError.code === "aborted" ? { status: "idle" } : { status: "error", error: apiError, params });
      }
    },
    [tool.slug],
  );

  const startBatch = useCallback(
    async (batch: File[], indices: number[], params: Params) => {
      controller.current?.abort();
      const current = new AbortController();
      controller.current = current;
      setBatchParams(params);
      setBatchRunning(true);
      setItems((previous) => previous.map((state, index) => (indices.includes(index) ? { status: "queued" } : state)));
      await processBatch(batch, indices, (image, options) => processImage(tool.slug, image, params, options), {
        signal: current.signal,
        onUpdate: (index, state) => {
          if (controller.current === current) {
            setItems((previous) => previous.map((item, i) => (i === index ? state : item)));
          }
        },
      });
      if (controller.current === current) setBatchRunning(false);
    },
    [tool.slug],
  );

  const apply = (chosen: File[] = files) => {
    if (chosen.length === 0) return;
    const built = buildParams();
    if (!built.ok) {
      setFormError(built.error);
      return;
    }
    setFormError(null);
    if (chosen.length > 1) void startBatch(chosen, chosen.map((_, index) => index), built.params);
    else void start(chosen[0], built.params);
  };

  const clear = (chosen: File[]) => {
    controller.current?.abort();
    controller.current = null;
    setFiles(chosen);
    setRun({ status: "idle" });
    setItems(chosen.map(() => ({ status: "queued" })));
    setBatchRunning(false);
    setBatchParams(null);
    setFormError(null);
    setNotices([]);
  };

  const choose = (chosen: File[], rejected: string[] = []) => {
    clear(chosen);
    setNotices(rejected);
    if (autoRun) apply(chosen);
  };

  const running = run.status === "running" || batchRunning;
  const retryable = items.flatMap((state, index) => (state.status === "error" && state.error.retryable ? [index] : []));
  const batchTouched = items.some((state) => state.status !== "queued");
  const label = isBatch
    ? batchTouched
      ? "Apply changes to all"
      : `${tool.action} ${files.length} images`
    : run.status === "done"
      ? "Apply changes"
      : tool.action;

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section aria-label={isBatch ? "Images" : "Image"} className="flex min-w-0 flex-col gap-4">
        {files.length === 0 && <Dropzone onFiles={choose} max={tool.batchZipName ? MAX_BATCH : 1} />}

        {files.length > 0 && notices.length > 0 && (
          <ul role="alert" className="flex flex-col gap-1 text-sm text-down">
            {notices.map((notice, index) => (
              <li key={index}>{notice}</li>
            ))}
          </ul>
        )}

        {isBatch && (
          <BatchList
            files={files}
            items={items}
            running={batchRunning}
            action={label}
            onCancel={() => controller.current?.abort()}
            onRetry={retryable.length > 0 && batchParams ? () => void startBatch(files, retryable, batchParams) : null}
            onDownload={(index) => {
              const state = items[index];
              if (state.status === "done") saveBlob(state.result.blob, state.result.filename);
            }}
            onDownloadAll={async () => {
              const results = items.flatMap((state) => (state.status === "done" ? [state.result] : []));
              saveBlob(await zipResults(results), tool.batchZipName ?? "images.zip");
            }}
            onStartOver={() => clear([])}
          />
        )}

        {single && (
          <>
            {run.status === "done" && originalUrl && resultUrl ? (
              <BeforeAfter
                before={originalUrl}
                after={resultUrl}
                beforeFit={run.params.fit === "cover" ? "cover" : "contain"}
                onResultSize={(width, height) => setResultSize([width, height])}
              />
            ) : (
              <Original key={originalUrl} url={originalUrl} name={single.name} dimmed={running} />
            )}

            <Status
              run={run}
              onCancel={() => controller.current?.abort()}
              onRetry={() => {
                if (run.status === "error") void start(single, run.params);
              }}
              onChooseAnother={() => clear([])}
            />

            {run.status === "done" ? (
              <Result
                original={single}
                result={run.result}
                size={resultSize}
                onDownload={() => saveBlob(run.result.blob, run.result.filename)}
                onStartOver={() => clear([])}
              />
            ) : (
              run.status === "idle" && (
                <button
                  type="button"
                  onClick={() => clear([])}
                  className="w-fit text-sm text-ink-soft underline underline-offset-4 hover:text-accent"
                >
                  Use another image
                </button>
              )
            )}
          </>
        )}
      </section>

      <aside
        aria-label={`${tool.name} settings`}
        className="flex flex-col gap-5 rounded-2xl border border-line-soft bg-sand/40 p-5"
      >
        <h2 className="font-display text-lg font-medium">Settings</h2>
        {options}
        {formError && (
          <p role="alert" className="text-sm text-down">
            {formError}
          </p>
        )}
        <button type="button" onClick={() => apply()} disabled={files.length === 0 || running} className={PRIMARY_BUTTON}>
          {label}
        </button>
        {files.length === 0 && (
          <p className="text-sm text-ink-muted">
            {tool.batchZipName ? `Choose an image, or up to ${MAX_BATCH}, to get started.` : "Choose an image to get started."}
          </p>
        )}
      </aside>
    </div>
  );
}

/** The chosen image, shown straight away from an object URL. */
function Original({ url, name, dimmed }: { url: string | null; name: string; dimmed: boolean }) {
  const [failed, setFailed] = useState(false);
  return (
    <figure className="flex flex-col gap-2">
      <div className="grid aspect-[4/3] max-h-[70vh] w-full place-items-center overflow-hidden rounded-xl border border-line bg-sand">
        {url && !failed ? (
          // Object URLs can't go through next/image's optimiser.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={`Original: ${name}`}
            onError={() => setFailed(true)}
            className={`size-full object-contain transition-opacity ${dimmed ? "opacity-60" : ""}`}
          />
        ) : (
          <p className="p-6 text-center text-sm text-ink-muted">
            {url ? "No preview in this browser. It will still work." : ""}
          </p>
        )}
      </div>
      <figcaption className="truncate text-sm text-ink-meta" title={name}>
        {name}
      </figcaption>
    </figure>
  );
}

function Status({
  run,
  onCancel,
  onRetry,
  onChooseAnother,
}: {
  run: Run;
  onCancel: () => void;
  onRetry: () => void;
  onChooseAnother: () => void;
}) {
  return (
    <div aria-live="polite" className="empty:hidden">
      {run.status === "running" && <Running progress={run.progress} onCancel={onCancel} />}
      {run.status === "error" && (
        <div role="alert" className="flex flex-col gap-3 rounded-xl border border-down/30 bg-down/5 p-4">
          <p className="text-sm text-ink">{run.error.message}</p>
          <div className="flex flex-wrap items-center gap-4">
            {run.error.retryable && (
              <button type="button" onClick={onRetry} className={SECONDARY_BUTTON}>
                Try again
              </button>
            )}
            <button
              type="button"
              onClick={onChooseAnother}
              className="text-sm text-ink-soft underline underline-offset-4 hover:text-accent"
            >
              Choose another image
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Running({ progress, onCancel }: { progress: Progress; onCancel: () => void }) {
  const uploading = progress.phase === "uploading";
  const label = uploading ? `Uploading… ${progress.percent}%` : "Processing…";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-4 text-sm">
        <span className="text-ink-body">{label}</span>
        <button type="button" onClick={onCancel} className="text-ink-soft underline underline-offset-4 hover:text-accent">
          Cancel
        </button>
      </div>
      <div
        role="progressbar"
        aria-label={uploading ? "Uploading" : "Processing"}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={uploading ? progress.percent : undefined}
        className="h-1.5 overflow-hidden rounded-full bg-sand"
      >
        <div
          className={`h-full rounded-full bg-accent transition-[width] ${uploading ? "" : "w-full animate-pulse"}`}
          style={uploading ? { width: `${progress.percent}%` } : undefined}
        />
      </div>
    </div>
  );
}

function Result({
  original,
  result,
  size,
  onDownload,
  onStartOver,
}: {
  original: File;
  result: ApiResult;
  size: [number, number] | null;
  onDownload: () => void;
  onStartOver: () => void;
}) {
  const smaller = result.blob.size < original.size ? Math.round((1 - result.blob.size / original.size) * 100) : 0;
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-line-soft p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate font-medium text-ink" title={result.filename}>
          {result.filename}
        </p>
        <p className="font-mono text-xs text-ink-meta">
          {size ? `${size[0]} × ${size[1]} · ` : ""}
          {formatBytes(original.size)} → {formatBytes(result.blob.size)}
          {smaller > 0 ? ` (${smaller}% smaller)` : ""}
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={onStartOver} className={SECONDARY_BUTTON}>
          New image
        </button>
        <button type="button" onClick={onDownload} className={PRIMARY_BUTTON}>
          Download
        </button>
      </div>
    </div>
  );
}
