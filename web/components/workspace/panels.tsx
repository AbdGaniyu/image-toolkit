"use client";

import { useId, type ReactNode } from "react";
import type { Fit, OutputFormat, Position } from "@/lib/params";
import { POSITIONS } from "@/lib/params";
import { CHIP_GROUPS, type Chip } from "@/lib/presetChips";

/** A radio group drawn as the Modernist segmented control. */
function Seg<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | null;
  options: readonly { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
}) {
  const name = useId();
  return (
    <div role="radiogroup" aria-label={label} className="seg flex-wrap">
      {options.map((option) => (
        <label key={option.value} className="seg-opt">
          <input type="radio" name={name} checked={value === option.value} onChange={() => onChange(option.value)} />
          {option.label}
        </label>
      ))}
    </div>
  );
}

const FORMATS = [
  { value: "jpg", label: "JPG" },
  { value: "png", label: "PNG" },
  { value: "webp", label: "WEBP" },
] as const;

// ——— Remove background ———

export type Fill = "transparent" | "#ffffff" | "#000000" | "custom";

export function RemoveBgPanel({
  done,
  fill,
  custom,
  runButton,
  onFill,
  onCustom,
}: {
  done: boolean;
  fill: Fill;
  custom: string;
  runButton: ReactNode;
  onFill: (fill: Fill) => void;
  onCustom: (color: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      {runButton}
      {done && (
        <div className="flex flex-col gap-2">
          <div className="kicker">Background behind the cut-out</div>
          <Seg
            label="Background behind the cut-out"
            value={fill}
            options={[
              { value: "transparent", label: "Transparent" },
              { value: "#ffffff", label: "White" },
              { value: "#000000", label: "Black" },
              { value: "custom", label: "Custom" },
            ]}
            onChange={onFill}
          />
          {fill === "custom" && (
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label="Custom background colour"
                value={custom}
                onChange={(event) => onCustom(event.target.value)}
                className="h-9 w-11 border border-[var(--color-divider)] bg-transparent p-0.5"
              />
              <div className="text-[13px]">{custom}</div>
            </div>
          )}
        </div>
      )}
      <div className="muted border-t border-[var(--color-divider)] pt-3 text-xs leading-normal">
        Plain, even backgrounds cut cleanest; drag the handle to check the edge.
      </div>
    </div>
  );
}

// ——— Resize ———

export function ResizePanel({
  chipId,
  width,
  height,
  lock,
  fit,
  format,
  runButton,
  onChip,
  onWidth,
  onHeight,
  onToggleLock,
  onFit,
  onFormat,
}: {
  chipId: string | null;
  width: number;
  height: number;
  lock: boolean;
  fit: Fit;
  format: OutputFormat;
  runButton: ReactNode;
  onChip: (chip: Chip) => void;
  onWidth: (width: number) => void;
  onHeight: (height: number) => void;
  onToggleLock: () => void;
  onFit: (fit: Fit) => void;
  onFormat: (format: OutputFormat) => void;
}) {
  const widthId = useId();
  const heightId = useId();
  const presetName = useId();
  return (
    <div className="flex flex-col gap-4">
      {CHIP_GROUPS.map((group) => (
        <div key={group.platform} className="flex flex-col gap-1.5">
          <div className="kicker">{group.platform}</div>
          <div role="radiogroup" aria-label={`${group.platform} sizes`} className="seg flex-wrap">
            {group.chips.map((chip) => (
              <label key={chip.id} className="seg-opt" title={`${chip.width}×${chip.height}`}>
                <input type="radio" name={presetName} checked={chipId === chip.id} onChange={() => onChip(chip)} />
                {chip.label}
              </label>
            ))}
          </div>
        </div>
      ))}

      <div className="flex items-end gap-2">
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor={widthId} className="kicker">
            Width
          </label>
          <input
            id={widthId}
            className="input"
            type="number"
            inputMode="numeric"
            min={1}
            max={10000}
            value={width || ""}
            onChange={(event) => onWidth(parseInt(event.target.value || "0", 10) || 0)}
          />
        </div>
        <button
          type="button"
          className="btn btn-secondary h-9 px-2.5"
          onClick={onToggleLock}
          aria-pressed={lock}
          aria-label="Lock aspect ratio"
          title="Lock aspect ratio"
          style={{
            background: lock ? "var(--color-accent)" : "transparent",
            color: lock ? "var(--color-bg)" : "var(--color-text)",
            borderColor: lock ? "var(--color-accent)" : "var(--color-divider)",
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" aria-hidden="true">
            <rect x="4" y="11" width="16" height="10" />
            <path d={lock ? "M8 11V8a4 4 0 0 1 8 0v3" : "M8 11V8a4 4 0 0 1 7-2.6"} />
          </svg>
        </button>
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor={heightId} className="kicker">
            Height
          </label>
          <input
            id={heightId}
            className="input"
            type="number"
            inputMode="numeric"
            min={1}
            max={10000}
            value={height || ""}
            onChange={(event) => onHeight(parseInt(event.target.value || "0", 10) || 0)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="kicker">Fit</div>
        <Seg
          label="Fit"
          value={fit}
          options={[
            {
              value: "cover",
              label: (
                <>
                  <svg width="22" height="16" viewBox="0 0 22 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <rect x="1" y="1" width="20" height="14" />
                    <rect x="-2" y="1" width="26" height="14" strokeDasharray="3 2" />
                  </svg>
                  Cover
                </>
              ),
            },
            {
              value: "contain",
              label: (
                <>
                  <svg width="22" height="16" viewBox="0 0 22 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <rect x="1" y="1" width="20" height="14" />
                    <rect x="5" y="4" width="12" height="8" strokeDasharray="3 2" />
                  </svg>
                  Contain
                </>
              ),
            },
          ]}
          onChange={onFit}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="kicker">Output</div>
        <Seg label="Output format" value={format} options={FORMATS} onChange={onFormat} />
      </div>

      {runButton}
    </div>
  );
}

// ——— Convert ———

export function ConvertPanel({
  format,
  quality,
  keepMetadata,
  estimate,
  note,
  runButton,
  onFormat,
  onQuality,
  onKeepMetadata,
}: {
  format: OutputFormat;
  quality: number;
  keepMetadata: boolean;
  estimate: string;
  note: string;
  runButton: ReactNode;
  onFormat: (format: OutputFormat) => void;
  onQuality: (quality: number) => void;
  onKeepMetadata: (keep: boolean) => void;
}) {
  const qualityId = useId();
  return (
    <div className="flex flex-col gap-4">
      <Seg label="Format" value={format} options={FORMATS} onChange={onFormat} />

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline gap-2">
          <label htmlFor={qualityId} className="kicker">
            Quality
          </label>
          <div className="heading text-[13px]">{quality}%</div>
          <div className="heading ml-auto text-xl text-[var(--color-accent-700)]" aria-live="polite">
            {estimate}
          </div>
        </div>
        <input
          id={qualityId}
          type="range"
          min={10}
          max={100}
          step={1}
          value={quality}
          disabled={format === "png"}
          onChange={(event) => onQuality(Number(event.target.value))}
          className="range"
        />
        <div className="muted text-xs">{note}</div>
      </div>

      <label className="flex cursor-pointer items-center gap-2.5 text-sm">
        <input
          type="checkbox"
          checked={keepMetadata}
          onChange={(event) => onKeepMetadata(event.target.checked)}
          className="size-[17px] accent-[var(--color-accent)]"
        />
        Keep metadata (EXIF, date, camera)
      </label>

      {runButton}
    </div>
  );
}

// ——— Watermark ———

const POSITION_NAMES: Record<Position, string> = {
  "top-left": "Top left",
  top: "Top centre",
  "top-right": "Top right",
  left: "Middle left",
  center: "Centre",
  right: "Middle right",
  "bottom-left": "Bottom left",
  bottom: "Bottom centre",
  "bottom-right": "Bottom right",
};

export function WatermarkPanel({
  kind,
  text,
  logoName,
  logoProblem,
  position,
  opacity,
  scale,
  runButton,
  onKind,
  onText,
  onPickLogo,
  onPosition,
  onOpacity,
  onScale,
}: {
  kind: "text" | "logo";
  text: string;
  logoName: string;
  logoProblem: string | null;
  position: Position;
  opacity: number;
  scale: number;
  runButton: ReactNode;
  onKind: (kind: "text" | "logo") => void;
  onText: (text: string) => void;
  onPickLogo: () => void;
  onPosition: (position: Position) => void;
  onOpacity: (opacity: number) => void;
  onScale: (scale: number) => void;
}) {
  const markId = useId();
  const opacityId = useId();
  const scaleId = useId();
  const positionName = useId();
  return (
    <div className="flex flex-col gap-4">
      <Seg
        label="Watermark type"
        value={kind}
        options={[
          { value: "text", label: "Text" },
          { value: "logo", label: "Logo" },
        ]}
        onChange={onKind}
      />

      {kind === "text" ? (
        <div className="flex flex-col gap-1">
          <label htmlFor={markId} className="kicker">
            Mark
          </label>
          <input id={markId} className="input" type="text" maxLength={100} value={text} onChange={(event) => onText(event.target.value)} />
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-3">
            <button type="button" className="btn btn-secondary" onClick={onPickLogo}>
              Choose logo (PNG)
            </button>
            <div className="muted truncate text-xs">{logoName}</div>
          </div>
          {logoProblem && (
            <div role="alert" className="text-xs text-[var(--color-accent-800)]">
              {logoProblem}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <div className="kicker" id={positionName}>
          Position
        </div>
        <div role="radiogroup" aria-labelledby={positionName} className="flex w-max flex-col gap-[2px]">
          {[0, 1, 2].map((row) => (
            <div key={row} className="seg">
              {POSITIONS.slice(row * 3, row * 3 + 3).map((cell) => (
                <label key={cell} className="seg-opt grid size-11 place-items-center p-0" title={POSITION_NAMES[cell]}>
                  <input
                    type="radio"
                    name={positionName}
                    aria-label={POSITION_NAMES[cell]}
                    checked={position === cell}
                    onChange={() => onPosition(cell)}
                  />
                  <span aria-hidden="true" className="block size-2.5 bg-current" />
                </label>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="kicker flex items-baseline gap-2">
          <label htmlFor={opacityId}>Opacity</label>
          <span className="heading ml-auto text-[13px] tracking-normal text-[var(--color-text)]">{opacity}%</span>
        </div>
        <input id={opacityId} type="range" min={5} max={100} step={1} value={opacity} onChange={(event) => onOpacity(Number(event.target.value))} className="range" />
        <div className="kicker flex items-baseline gap-2">
          <label htmlFor={scaleId}>Scale</label>
          <span className="heading ml-auto text-[13px] tracking-normal text-[var(--color-text)]">{scale}%</span>
        </div>
        <input id={scaleId} type="range" min={5} max={60} step={1} value={scale} onChange={(event) => onScale(Number(event.target.value))} className="range" />
      </div>

      {runButton}
    </div>
  );
}
