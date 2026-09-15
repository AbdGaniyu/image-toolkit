"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import InlineError from "@/components/InlineError";
import BatchBar from "@/components/workspace/BatchBar";
import { ConvertPanel, RemoveBgPanel, ResizePanel, WatermarkPanel, type Fill } from "@/components/workspace/panels";
import Stage, { type StageStatus } from "@/components/workspace/Stage";
import { processImage, type Endpoint } from "@/lib/api";
import { processBatch, zipResults, type ItemState } from "@/lib/batch";
import { estimateSize, loadImage, withBackground, type WatermarkPreview } from "@/lib/canvas";
import { saveBlob } from "@/lib/download";
import { ACCEPT, checkFiles, filesFromTransfer, formatBytes, MAX_BATCH } from "@/lib/files";
import {
  convertParams,
  removeBgParams,
  watermarkParams,
  type Built,
  type Fit,
  type OutputFormat,
  type Position,
} from "@/lib/params";
import { takePendingFiles } from "@/lib/pending";
import { resizeRequest, type Chip } from "@/lib/presetChips";
import { sampleFile } from "@/lib/sample";
import { TOOL_BY_SLUG } from "@/lib/tools";
import { useObjectUrl } from "@/lib/useObjectUrl";

type Item = {
  id: string;
  file: File;
  /** Object URL of the original, shown straight away. */
  url: string;
  /** Pixel size once decoded; stays null if this browser can't decode it. */
  size: [number, number] | null;
  state: ItemState;
};

const TABS: readonly { slug: Endpoint; label: string }[] = [
  { slug: "remove-bg", label: "Remove BG" },
  { slug: "resize", label: "Resize" },
  { slug: "convert", label: "Convert" },
  { slug: "watermark", label: "Watermark" },
];

const NOTES: Record<Endpoint, [string, string]> = {
  "remove-bg": ["Remove background", "One pass, no settings. Check the edge with the slider, then choose what sits behind it."],
  resize: ["Resize", "Pick a platform size or type your own. The frame on the stage shows the crop you’ll get."],
  convert: ["Convert & compress", "Format first, then trade quality against weight — the size shown is your browser’s estimate."],
  watermark: ["Watermark", "Text or a logo, placed on a nine-point grid. The stage previews it as you set it."],
};

/**
 * The workspace from the design: one template, four tools. Images stay loaded
 * when switching tools; results are cleared. All processing goes to the API.
 */
export default function Workspace({ initialTool }: { initialTool: Endpoint }) {
  const [tool, setTool] = useState<Endpoint>(initialTool);
  const batchTool = Boolean(TOOL_BY_SLUG[tool].batchZipName);
  const [items, setItems] = useState<Item[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [lastParams, setLastParams] = useState<Built | null>(null);

  // Remove background
  const [fill, setFill] = useState<Fill>("transparent");
  const [customFill, setCustomFill] = useState("#ec3013");
  const [filled, setFilled] = useState<Blob | null>(null);
  // Resize
  const [chipId, setChipId] = useState<string | null>("ig-post");
  const [width, setWidth] = useState(1080);
  const [height, setHeight] = useState(1080);
  const [lock, setLock] = useState(true);
  const [fit, setFit] = useState<Fit>("cover");
  const [outFormat, setOutFormat] = useState<OutputFormat>("jpg");
  // Convert
  const [cvtFormat, setCvtFormat] = useState<OutputFormat>("jpg");
  const [quality, setQuality] = useState(82);
  const [keepMeta, setKeepMeta] = useState(false);
  const [estimate, setEstimate] = useState("—");
  // Watermark
  const [wmKind, setWmKind] = useState<"text" | "logo">("text");
  const [wmText, setWmText] = useState("© STUDIO 2026");
  const [logo, setLogo] = useState<File | null>(null);
  const [logoImage, setLogoImage] = useState<HTMLImageElement | null>(null);
  const [logoProblem, setLogoProblem] = useState<string | null>(null);
  const [wmPos, setWmPos] = useState<Position>("bottom-right");
  const [opacity, setOpacity] = useState(55);
  const [scale, setScale] = useState(22);

  const fileInput = useRef<HTMLInputElement>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const pickMode = useRef<"replace" | "add">("replace");
  const controller = useRef<AbortController | null>(null);
  const images = useRef(new Map<string, HTMLImageElement>());
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const seq = useRef(0);

  const active = items.find((item) => item.id === activeId) ?? null;
  const activeResult = active?.state.status === "done" ? active.state.result : null;
  const displayBlob = tool === "remove-bg" && filled ? filled : (activeResult?.blob ?? null);
  const resultUrl = useObjectUrl(displayBlob);

  // ——— intake ———

  function addFiles(files: File[], mode: "replace" | "add") {
    if (files.length === 0) return;
    const keep = batchTool && mode === "add" ? itemsRef.current : [];
    const { accepted, rejected } = checkFiles(files, batchTool ? MAX_BATCH : 1);
    const room = batchTool ? MAX_BATCH - keep.length : 1;
    const taken = accepted.slice(0, Math.max(0, room));
    const overflow = accepted.slice(taken.length).map((file) => `${file.name} wasn’t added: up to ${MAX_BATCH} images at a time.`);
    const problems = [...rejected, ...overflow];
    setNotice(problems.length ? problems.join(" ") : null);
    if (taken.length === 0) return;

    controller.current?.abort();
    controller.current = null;
    setRunning(false);
    const dropped = itemsRef.current.filter((item) => !keep.includes(item));
    dropped.forEach((item) => {
      URL.revokeObjectURL(item.url);
      images.current.delete(item.id);
    });

    const added: Item[] = taken.map((file) => ({
      id: `f${++seq.current}`,
      file,
      url: URL.createObjectURL(file),
      size: null,
      state: { status: "queued" },
    }));
    setItems([...keep.map((item) => ({ ...item, state: { status: "queued" } as ItemState })), ...added]);
    setActiveId(added[0].id);
    for (const item of added) {
      void loadImage(item.url).then((image) => {
        if (!image) return;
        images.current.set(item.id, image);
        setItems((list) =>
          list.map((entry) => (entry.id === item.id ? { ...entry, size: [image.naturalWidth, image.naturalHeight] } : entry)),
        );
      });
    }
  }
  const addRef = useRef(addFiles);
  addRef.current = addFiles;

  const pick = (mode: "replace" | "add") => {
    pickMode.current = mode;
    if (!fileInput.current) return;
    fileInput.current.value = "";
    fileInput.current.click();
  };

  useEffect(() => {
    const pending = takePendingFiles();
    if (pending.length) addRef.current(pending, "replace");
    const onPaste = (event: ClipboardEvent) => {
      const files = filesFromTransfer(event.clipboardData);
      if (files.length === 0) return;
      event.preventDefault();
      addRef.current(files, "replace");
    };
    window.addEventListener("paste", onPaste);
    const known = images.current;
    return () => {
      window.removeEventListener("paste", onPaste);
      controller.current?.abort();
      itemsRef.current.forEach((item) => URL.revokeObjectURL(item.url));
      known.clear();
    };
  }, []);

  // ——— tools ———

  const switchTool = (next: Endpoint) => {
    if (next === tool) return;
    controller.current?.abort();
    controller.current = null;
    setRunning(false);
    setItems((list) => list.map((item) => ({ ...item, state: { status: "queued" } })));
    setNotice(null);
    setTool(next);
    window.history.pushState(null, "", `/${next}`);
  };

  function buildParams(): Built {
    switch (tool) {
      case "remove-bg":
        return removeBgParams({ keepMetadata: false });
      case "resize":
        return resizeRequest({ chipId, width, height, fit, format: outFormat, keepMetadata: false });
      case "convert":
        return convertParams({ format: cvtFormat, quality, keepMetadata: keepMeta });
      case "watermark":
        return watermarkParams({
          kind: wmKind,
          text: wmText,
          logo,
          position: wmPos,
          opacity,
          scale,
          color: "#ffffff",
          keepMetadata: false,
        });
    }
  }

  async function run(onlyIds?: string[], built: Built = buildParams()) {
    if (!built.ok) {
      setNotice(built.error);
      return;
    }
    setNotice(null);
    const list = itemsRef.current;
    const ids = onlyIds ?? (batchTool ? list.map((item) => item.id) : activeId ? [activeId] : []);
    const indices = ids.map((id) => list.findIndex((item) => item.id === id)).filter((index) => index >= 0);
    if (indices.length === 0) return;

    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setRunning(true);
    setLastParams(built);
    setFilled(null);
    setItems((all) => all.map((item) => (ids.includes(item.id) ? { ...item, state: { status: "queued" } } : item)));

    await processBatch(
      list.map((item) => item.file),
      indices,
      (file, options) => processImage(tool, file, built.params, options),
      {
        signal: current.signal,
        onUpdate: (index, state) => {
          if (controller.current !== current) return;
          const id = list[index].id;
          setItems((all) => all.map((item) => (item.id === id ? { ...item, state } : item)));
          if (state.status === "running") setActiveId(id);
        },
      },
    );
    if (controller.current === current) setRunning(false);
  }

  // Remove background: lay the cut-out on the chosen colour.
  useEffect(() => {
    if (tool !== "remove-bg" || !activeResult || fill === "transparent") {
      setFilled(null);
      return;
    }
    let cancelled = false;
    withBackground(activeResult.blob, fill === "custom" ? customFill : fill).then(
      (blob) => !cancelled && setFilled(blob),
      () => !cancelled && setFilled(null),
    );
    return () => {
      cancelled = true;
    };
  }, [tool, activeResult, fill, customFill]);

  // Convert: the browser's estimate of the output size, 180 ms after the last change.
  const activeSize = active?.size;
  useEffect(() => {
    if (tool !== "convert" || cvtFormat === "png") return;
    const image = activeId ? images.current.get(activeId) : undefined;
    if (!image || !activeSize) {
      setEstimate("—");
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const bytes = await estimateSize(image, cvtFormat, quality);
      if (!cancelled && bytes) setEstimate(`~${formatBytes(bytes)}`);
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [tool, activeId, activeSize, cvtFormat, quality]);

  const watermark = useMemo<WatermarkPreview | null>(
    () =>
      tool === "watermark"
        ? { kind: wmKind, text: wmText, logo: logoImage, position: wmPos, opacity, scale }
        : null,
    [tool, wmKind, wmText, logoImage, wmPos, opacity, scale],
  );

  const onLogo = (files: File[]) => {
    const { accepted, rejected } = checkFiles(files, 1);
    setLogoProblem(rejected[0] ?? null);
    const file = accepted[0];
    if (!file) return;
    setLogo(file);
    const url = URL.createObjectURL(file);
    void loadImage(url).then((image) => {
      URL.revokeObjectURL(url);
      setLogoImage(image);
    });
  };

  // ——— derived view ———

  let status: StageStatus = "empty";
  let percent = 0;
  if (active) {
    const state = active.state;
    if (state.status === "running") {
      status = state.progress.phase === "uploading" ? "uploading" : "processing";
      percent = state.progress.phase === "uploading" ? state.progress.percent : 100;
    } else {
      status = state.status === "done" ? "done" : "ready";
    }
  }

  const ratio = active?.size ? active.size[0] / active.size[1] : 1;
  const count = batchTool ? items.length : active ? 1 : 0;
  const runLabel = running
    ? "Working…"
    : {
        "remove-bg": "Remove background",
        resize: count > 1 ? `Resize ${count} images` : "Resize image",
        convert: count > 1 ? `Convert ${count} images` : "Convert image",
        watermark: "Apply watermark",
      }[tool];
  const runButton = (
    <button
      type="button"
      className="btn btn-primary btn-block run-btn px-3 py-3 text-[15px]"
      onClick={() => void run()}
      disabled={count === 0 || running}
    >
      {runLabel}
    </button>
  );

  const failedRetryable = items.filter((item) => item.state.status === "error" && item.state.error.retryable).map((item) => item.id);
  const activeError = active?.state.status === "error" ? active.state.error : null;
  const fileLine = active
    ? `${active.file.name} · ${active.size ? `${active.size[0]}×${active.size[1]}` : formatBytes(active.file.size)}`
    : "No image yet";
  const [title, note] = NOTES[tool];

  const download = () => {
    if (activeResult && displayBlob) saveBlob(displayBlob, activeResult.filename);
  };
  const downloadAll = async () => {
    const done = items.flatMap((item) => (item.state.status === "done" ? [item.state.result] : []));
    if (done.length === 1) saveBlob(done[0].blob, done[0].filename);
    else if (done.length > 1) saveBlob(await zipResults(done), TOOL_BY_SLUG[tool].batchZipName ?? "images.zip");
  };

  return (
    <>
      <input
        ref={fileInput}
        type="file"
        accept={ACCEPT}
        multiple={batchTool}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => addFiles(Array.from(event.target.files ?? []), pickMode.current)}
      />
      <input
        ref={logoInput}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => onLogo(Array.from(event.target.files ?? []))}
      />

      <section className="flex flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-4 border-b-2 border-[var(--color-divider)] px-[clamp(16px,3vw,32px)] py-3">
          <Link href="/" className="btn btn-ghost pl-0 no-underline" aria-label="All tools">
            &larr;<span className="max-sm:hidden"> Tools</span>
          </Link>
          <nav aria-label="Tools" className="seg ws-tabs flex-wrap">
            {TABS.map((tab) => (
              <button
                key={tab.slug}
                type="button"
                className="seg-opt cursor-pointer"
                aria-current={tool === tab.slug ? "page" : undefined}
                onClick={() => switchTool(tab.slug)}
              >
                {tab.label}
              </button>
            ))}
          </nav>
          <div className="ml-auto flex flex-wrap items-center gap-4">
            <div className="muted text-right text-xs max-sm:hidden" aria-live="polite">
              {fileLine}
            </div>
            <button type="button" className="btn btn-secondary" onClick={() => pick("replace")} disabled={running}>
              Replace
            </button>
            {/* On phones the sheet's Result section carries Download instead. */}
            <button
              type="button"
              className="btn btn-primary justify-start gap-2 max-sm:hidden"
              onClick={download}
              disabled={!displayBlob}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" aria-hidden="true">
                <path d="M12 3v12" />
                <path d="M7 11l5 5 5-5" />
                <path d="M4 21h16" />
              </svg>
              Download
            </button>
          </div>
        </div>

        <div className="flex flex-1 flex-wrap items-stretch">
          <div className="flex min-w-[280px] flex-[1_1_520px] flex-col border-r-2 border-[var(--color-divider)]">
            <div className="flex flex-1 flex-col gap-3 p-[clamp(16px,2.5vw,28px)]">
              <Stage
                status={status}
                percent={percent}
                originalUrl={active?.url ?? null}
                resultUrl={resultUrl}
                imageSize={active?.size ?? null}
                frameAspect={tool === "resize" && width > 0 && height > 0 ? width / height : null}
                watermark={watermark}
                onFiles={(files) => addFiles(files, "replace")}
                onPick={() => pick("replace")}
                onSample={async () => addFiles([await sampleFile()], "replace")}
                onCancel={() => controller.current?.abort()}
              />

              {notice && <InlineError message={notice} onDismiss={() => setNotice(null)} />}
              {activeError && (
                <InlineError
                  message={activeError.message}
                  action={
                    activeError.retryable && lastParams ? (
                      <button
                        type="button"
                        className="btn btn-ghost px-1 py-0 text-[var(--color-accent-800)]"
                        onClick={() => void run(batchTool ? failedRetryable : [active!.id], lastParams)}
                      >
                        Try again
                      </button>
                    ) : undefined
                  }
                  onDismiss={() =>
                    setItems((all) => all.map((item) => (item.id === active!.id ? { ...item, state: { status: "queued" } } : item)))
                  }
                />
              )}

              {batchTool && items.length > 0 && (
                <BatchBar
                  items={items.map((item) => ({ id: item.id, name: item.file.name, url: item.url, state: item.state }))}
                  activeId={activeId}
                  onSelect={setActiveId}
                  onAdd={() => pick("add")}
                  onDownloadAll={downloadAll}
                />
              )}
            </div>
          </div>

          <aside
            aria-label={`${title} settings`}
            className="ws-panel flex max-w-[420px] min-w-[280px] flex-[1_1_330px] flex-col gap-4 bg-[var(--color-surface)] p-[clamp(16px,2.5vw,24px)]"
          >
            <div className="sheet-handle" aria-hidden="true" />
            <div>
              <h2 className="mb-1 text-2xl">{title}</h2>
              <div className="text-[13px] leading-normal opacity-80">{note}</div>
            </div>

            {tool === "remove-bg" && (
              <RemoveBgPanel
                done={Boolean(activeResult)}
                fill={fill}
                custom={customFill}
                runButton={runButton}
                onFill={setFill}
                onCustom={setCustomFill}
              />
            )}
            {tool === "resize" && (
              <ResizePanel
                chipId={chipId}
                width={width}
                height={height}
                lock={lock}
                fit={fit}
                format={outFormat}
                runButton={runButton}
                onChip={(chip: Chip) => {
                  setChipId(chip.id);
                  setWidth(chip.width);
                  setHeight(chip.height);
                }}
                onWidth={(value) => {
                  setChipId(null);
                  setWidth(value);
                  if (lock) setHeight(Math.round(value / ratio));
                }}
                onHeight={(value) => {
                  setChipId(null);
                  setHeight(value);
                  if (lock) setWidth(Math.round(value * ratio));
                }}
                onToggleLock={() => setLock((on) => !on)}
                onFit={setFit}
                onFormat={setOutFormat}
              />
            )}
            {tool === "convert" && (
              <ConvertPanel
                format={cvtFormat}
                quality={quality}
                keepMetadata={keepMeta}
                estimate={cvtFormat === "png" ? "lossless" : estimate}
                note={
                  cvtFormat === "png"
                    ? "PNG keeps every pixel; the slider has no effect."
                    : active
                      ? `Source is ${formatBytes(active.file.size)}. The final file may differ a little.`
                      : "Load an image to see the estimate."
                }
                runButton={runButton}
                onFormat={setCvtFormat}
                onQuality={setQuality}
                onKeepMetadata={setKeepMeta}
              />
            )}
            {tool === "watermark" && (
              <WatermarkPanel
                kind={wmKind}
                text={wmText}
                logoName={logo?.name ?? "No file chosen"}
                logoProblem={logoProblem}
                position={wmPos}
                opacity={opacity}
                scale={scale}
                runButton={runButton}
                onKind={setWmKind}
                onText={setWmText}
                onPickLogo={() => {
                  if (!logoInput.current) return;
                  logoInput.current.value = "";
                  logoInput.current.click();
                }}
                onPosition={setWmPos}
                onOpacity={setOpacity}
                onScale={setScale}
              />
            )}

            {activeResult && displayBlob && (
              <div className="mt-auto flex flex-col gap-1.5 border-t-2 border-[var(--color-divider)] pt-3">
                <div className="kicker">Result</div>
                <div className="text-sm" data-result-line>
                  {activeResult.filename} · {formatBytes(displayBlob.size)}
                </div>
                <button type="button" className="btn btn-primary mt-1.5 justify-start" onClick={download}>
                  Download {activeResult.filename.split(".").pop()?.toUpperCase()}
                </button>
              </div>
            )}
          </aside>
        </div>
      </section>
    </>
  );
}
