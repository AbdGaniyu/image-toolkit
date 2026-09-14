"use client";

import { useRef, useState } from "react";

type Props = {
  before: string;
  after: string;
  /** How the original sits in the frame: "cover" mirrors a crop-to-fill resize, "contain" shows all of it. */
  beforeFit?: "cover" | "contain";
  /** Called with the result's pixel size once it has loaded. */
  onResultSize?: (width: number, height: number) => void;
};

/**
 * The original on the left, the result on the right, split by a divide you
 * drag (mouse or finger) or move with the arrow keys. The frame takes the
 * result's shape; transparent results sit on a checkerboard.
 */
export default function BeforeAfter({ before, after, beforeFit = "contain", onResultSize }: Props) {
  const [position, setPosition] = useState(50);
  const [ratio, setRatio] = useState(4 / 3);
  const [beforeFailed, setBeforeFailed] = useState(false);
  const frame = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const moveTo = (clientX: number) => {
    const box = frame.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    setPosition(Math.min(100, Math.max(0, ((clientX - box.left) / box.width) * 100)));
  };

  return (
    <div
      ref={frame}
      className="group relative mx-auto cursor-ew-resize touch-pan-y overflow-hidden rounded-xl border border-line bg-sand select-none"
      // Keep the result's shape but never taller than most of the screen.
      style={{ aspectRatio: ratio, width: `min(100%, calc(70vh * ${ratio}))` }}
      onPointerDown={(event) => {
        dragging.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        moveTo(event.clientX);
      }}
      onPointerMove={(event) => {
        if (dragging.current) moveTo(event.clientX);
      }}
      onPointerUp={() => {
        dragging.current = false;
      }}
      onPointerCancel={() => {
        dragging.current = false;
      }}
    >
      {beforeFailed ? (
        <p className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-ink-muted">
          No preview of the original in this browser
        </p>
      ) : (
        // Object URLs can't go through next/image's optimiser.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={before}
          alt="Original"
          draggable={false}
          onError={() => setBeforeFailed(true)}
          className={`absolute inset-0 size-full ${beforeFit === "cover" ? "object-cover" : "object-contain"}`}
        />
      )}

      <div className="checkerboard absolute inset-0" style={{ clipPath: `inset(0 0 0 ${position}%)` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={after}
          alt="Result"
          draggable={false}
          className="size-full object-contain"
          onLoad={(event) => {
            const { naturalWidth: width, naturalHeight: height } = event.currentTarget;
            if (width && height) {
              setRatio(width / height);
              onResultSize?.(width, height);
            }
          }}
        />
      </div>

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-paper shadow-[0_0_0_1px_rgb(0_0_0/0.15)]"
        style={{ left: `${position}%` }}
      >
        <div className="absolute top-1/2 left-1/2 grid size-9 -translate-1/2 place-items-center rounded-full bg-paper text-ink shadow-md group-has-[input:focus-visible]:outline-2 group-has-[input:focus-visible]:outline-offset-2 group-has-[input:focus-visible]:outline-accent">
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m9 6-6 6 6 6M15 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>

      <span className="pointer-events-none absolute top-2 left-2 rounded-full bg-ink/70 px-2 py-0.5 text-xs font-medium text-paper">
        Before
      </span>
      <span className="pointer-events-none absolute top-2 right-2 rounded-full bg-ink/70 px-2 py-0.5 text-xs font-medium text-paper">
        After
      </span>

      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={Math.round(position)}
        onChange={(event) => setPosition(Number(event.target.value))}
        aria-label="Divide between original and result"
        aria-valuetext={`${Math.round(position)}% original`}
        className="sr-only"
      />
    </div>
  );
}
