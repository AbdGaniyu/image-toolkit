"use client";

import { useId, type ReactNode } from "react";

/** Form building blocks for the tools' settings. Placeholder styling. */

export const PRIMARY_BUTTON =
  "inline-flex items-center justify-center rounded-full bg-ink px-5 py-2.5 font-medium text-paper transition-colors " +
  "hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-ink";
export const SECONDARY_BUTTON =
  "inline-flex items-center justify-center rounded-full border border-line px-5 py-2.5 font-medium text-ink " +
  "transition-colors hover:border-accent hover:text-accent";
export const INPUT = "w-full rounded-lg border border-line bg-paper px-3 py-2 text-base text-ink";

const LABEL = "text-sm font-medium text-ink-body";
const HINT = "text-xs text-ink-meta";
const FOCUS_WITHIN =
  "has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-accent";

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className={LABEL}>
        {label}
      </label>
      {children}
      {hint && <p className={HINT}>{hint}</p>}
    </div>
  );
}

/** A radio group drawn as pills. */
export function Choice<T extends string>({
  legend,
  value,
  options,
  hint,
  onChange,
}: {
  legend: string;
  value: T;
  options: readonly { value: T; label: string }[];
  hint?: string;
  onChange: (value: T) => void;
}) {
  const name = useId();
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className={`mb-1.5 ${LABEL}`}>{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <label
            key={option.value}
            className={`cursor-pointer rounded-full border border-line px-3.5 py-1.5 text-sm text-ink-soft has-checked:border-accent has-checked:bg-accent-wash has-checked:text-ink ${FOCUS_WITHIN}`}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </div>
      {hint && <p className={HINT}>{hint}</p>}
    </fieldset>
  );
}

export function Range({
  label,
  value,
  min,
  max,
  format = (v) => `${v}%`,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  format?: (value: number) => string;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className={LABEL}>
          {label}
        </label>
        <output htmlFor={id} className="font-mono text-xs text-ink-meta">
          {format(value)}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-accent"
      />
    </div>
  );
}

export function KeepMetadata({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  const id = useId();
  return (
    <div className="flex items-start gap-2.5">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 accent-accent"
      />
      <label htmlFor={id} className="text-sm text-ink-body">
        Keep photo details
        <span className={`block ${HINT}`}>Camera, date and location. Off by default, so your location isn’t shared.</span>
      </label>
    </div>
  );
}
