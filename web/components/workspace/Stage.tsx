"use client";

import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent, type PointerEvent } from "react";
import { drawWatermarkPreview, type WatermarkPreview } from "@/lib/canvas";
import { filesFromTransfer } from "@/lib/files";

export type StageStatus = "empty" | "uploading" | "processing" | "ready" | "done";

type Props = {
  status: StageStatus;
  /** Upload progress, 0-100. */
  percent: number;
  originalUrl: string | null;
  resultUrl: string | null;
  /** Pixel size of the original, once decoded; null if this browser can't show it (HEIC outside Safari). */
  imageSize: [number, number] | null;
  /** Resize: the target shape (width / height) drawn as a frame on the image. */
  frameAspect: number | null;
  /** Watermark: the mark to preview on the image before it's applied. */
  watermark: WatermarkPreview | null;
  onFiles: (files: File[]) => void;
  onPick: () => void;
  onSample: () => void;
  onCancel: () => void;
};

/** The image stage: checkerboard, the empty drop zone, progress, the image and its result. */
export default function Stage(props: Props) {
  const { status, percent, originalUrl, resultUrl, imageSize } = props;
  const showImage = status === "ready" || status === "processing" || status === "done";

  return (
    <div className="checker relative grid min-h-[300px] flex-1 place-items-center overflow-hidden border border-[var(--color-divider)] sm:min-h-[340px]">
      {status === "empty" && <EmptyZone {...props} />}

      {status === "uploading" && (
        <div className="grid justify-items-start gap-3 text-left" aria-live="polite">
          <svg width="88" height="88" viewBox="0 0 88 88" className="-rotate-90" aria-hidden="true">
            <circle cx="44" cy="44" r="38" fill="none" stroke="var(--color-neutral-300)" strokeWidth="6" />
            <circle
              cx="44"
              cy="44"
              r="38"
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth="6"
              strokeDasharray="239"
              strokeDashoffset={239 - (239 * percent) / 100}
            />
          </svg>
          <div className="heading text-[13px]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
            Uploading {percent}%
          </div>
          <button type="button" className="btn btn-ghost -ml-1 py-0" onClick={props.onCancel}>
            Cancel
          </button>
        </div>
      )}

      {showImage && originalUrl && (
        <div className="relative flex max-h-[60vh] max-w-full">
          {imageSize ? (
            // Object URLs can't go through next/image's optimiser.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={originalUrl} alt="Working image" className="block h-auto max-h-[60vh] w-auto max-w-full" />
          ) : status === "done" && resultUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={resultUrl} alt="Result" className="block h-auto max-h-[60vh] w-auto max-w-full" />
          ) : (
            <p className="max-w-[36ch] p-6 text-left text-sm">No preview of this format in your browser. It will still work.</p>
          )}

          {status === "done" && resultUrl && imageSize && <Compare resultUrl={resultUrl} />}
          {status === "ready" && props.watermark && imageSize && <WatermarkLayer size={imageSize} mark={props.watermark} />}
          {status !== "done" && props.frameAspect && imageSize && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div
                data-frame
                className="box-border h-[88%] max-w-[88%] border-2 border-[var(--color-accent)] transition-[aspect-ratio,height] duration-[350ms] ease-in-out"
                style={{ aspectRatio: props.frameAspect }}
              />
            </div>
          )}
          {status === "processing" && (
            <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
              <div className="shimmer" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EmptyZone({ onFiles, onPick, onSample }: Props) {
  const [dragging, setDragging] = useState(false);
  return (
    <div
      onClick={onPick}
      onDragOver={(event: DragEvent) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event: DragEvent) => {
        event.preventDefault();
        setDragging(false);
        onFiles(filesFromTransfer(event.dataTransfer));
      }}
      className="absolute inset-4 grid cursor-pointer place-items-center justify-items-start border-2 border-dashed border-[var(--color-divider)] p-6 text-left"
      style={{ background: dragging ? "var(--color-accent-100)" : "transparent" }}
    >
      <div>
        <button
          type="button"
          className="heading block cursor-pointer text-left text-[22px]"
          onClick={(event) => {
            event.stopPropagation();
            onPick();
          }}
        >
          Drop an image to start
        </button>
        <div className="mt-1 text-[13px] opacity-75">or click to browse, or paste &mdash; up to 15 MB</div>
        <button
          type="button"
          className="btn btn-secondary mt-4"
          onClick={(event) => {
            event.stopPropagation();
            onSample();
          }}
        >
          Use a sample photo
        </button>
      </div>
    </div>
  );
}

/** The result over the original, split by a handle; sweeps once on arrival, then hands over. */
function Compare({ resultUrl }: { resultUrl: string }) {
  const [pos, setPos] = useState(55);
  const box = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = (now - start) / 600;
      if (t < 1) setPos(ease(t) * 100);
      else if (t < 1 + 260 / 600) setPos(100 - ease((t - 1) * (600 / 260)) * 45);
      else return setPos(55);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [resultUrl]);

  const moveTo = (clientX: number) => {
    const rect = box.current?.getBoundingClientRect();
    if (rect && rect.width) setPos(Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)));
  };
  const onKey = (event: KeyboardEvent) => {
    const step = event.shiftKey ? 10 : 2;
    const next = { ArrowLeft: pos - step, ArrowRight: pos + step, Home: 0, End: 100 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    setPos(Math.max(0, Math.min(100, next)));
  };

  return (
    <div
      ref={box}
      className="absolute inset-0 touch-none"
      onPointerDown={(event: PointerEvent) => {
        dragging.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        moveTo(event.clientX);
      }}
      onPointerMove={(event: PointerEvent) => {
        if (dragging.current) moveTo(event.clientX);
      }}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={resultUrl}
        alt="Result"
        draggable={false}
        className="absolute inset-0 h-full w-full object-contain"
        style={{ clipPath: `inset(0 ${(100 - pos).toFixed(1)}% 0 0)` }}
      />
      <div
        role="slider"
        tabIndex={0}
        aria-label="Before and after"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pos)}
        aria-valuetext={`${Math.round(pos)}% result`}
        onKeyDown={onKey}
        className="absolute top-0 bottom-0 w-[2px] cursor-ew-resize bg-[var(--color-accent)]"
        style={{ left: `${pos.toFixed(1)}%` }}
      >
        <div className="absolute top-1/2 left-1/2 grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center bg-[var(--color-accent)] text-[var(--color-bg)]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" aria-hidden="true">
            <path d="M9 6l-5 6 5 6" />
            <path d="M15 6l5 6-5 6" />
          </svg>
        </div>
        {/* The result is revealed left of the handle, the original right of it. */}
        <div className="absolute top-2 right-2.5 bg-[var(--color-accent)] px-1.5 py-[3px] text-[10px] tracking-[0.1em] text-[var(--color-bg)] uppercase">
          After
        </div>
        <div className="absolute top-2 left-2.5 bg-[var(--color-text)] px-1.5 py-[3px] text-[10px] tracking-[0.1em] text-[var(--color-bg)] uppercase">
          Before
        </div>
      </div>
    </div>
  );
}

function WatermarkLayer({ size, mark }: { size: [number, number]; mark: WatermarkPreview }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (canvas.current) drawWatermarkPreview(canvas.current, size[0], size[1], mark);
  }, [size, mark]);
  return <canvas ref={canvas} data-watermark-preview aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" />;
}
