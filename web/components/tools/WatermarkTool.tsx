"use client";

import { useId, useState } from "react";
import { Choice, Field, INPUT, KeepMetadata, Range } from "@/components/fields";
import ToolWorkspace from "@/components/ToolWorkspace";
import { ACCEPT, checkFiles } from "@/lib/files";
import { POSITIONS, watermarkParams, type Position, type WatermarkOptions } from "@/lib/params";
import { TOOL_BY_SLUG } from "@/lib/tools";

const POSITION_LABELS: Record<Position, string> = {
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

export default function WatermarkTool() {
  const [options, setOptions] = useState<WatermarkOptions>({
    kind: "text",
    text: "",
    logo: null,
    position: "bottom-right",
    opacity: 50,
    scale: 25,
    color: "#ffffff",
    keepMetadata: false,
  });
  const [logoProblem, setLogoProblem] = useState<string | null>(null);
  const set = <K extends keyof WatermarkOptions>(key: K, value: WatermarkOptions[K]) =>
    setOptions((current) => ({ ...current, [key]: value }));
  const textId = useId();
  const colorId = useId();
  const logoId = useId();

  return (
    <ToolWorkspace
      tool={TOOL_BY_SLUG.watermark}
      buildParams={() => watermarkParams(options)}
      options={
        <>
          <Choice
            legend="Watermark"
            value={options.kind}
            options={[
              { value: "text", label: "Text" },
              { value: "logo", label: "Logo" },
            ]}
            onChange={(kind) => set("kind", kind)}
          />
          {options.kind === "text" ? (
            <div className="flex items-end gap-3">
              <div className="min-w-0 flex-1">
                <Field label="Text" htmlFor={textId}>
                  <input
                    id={textId}
                    type="text"
                    maxLength={100}
                    placeholder="© Your name"
                    value={options.text}
                    onChange={(event) => set("text", event.target.value)}
                    className={INPUT}
                  />
                </Field>
              </div>
              <Field label="Colour" htmlFor={colorId}>
                <input
                  id={colorId}
                  type="color"
                  value={options.color}
                  onChange={(event) => set("color", event.target.value)}
                  className="h-[2.625rem] w-14 cursor-pointer rounded-lg border border-line bg-paper p-1"
                />
              </Field>
            </div>
          ) : (
            <Field label="Logo" htmlFor={logoId} hint="A PNG with a transparent background works best.">
              <input
                id={logoId}
                type="file"
                accept={ACCEPT}
                onChange={(event) => {
                  const { accepted, rejected } = checkFiles(Array.from(event.target.files ?? []), 1);
                  setLogoProblem(rejected[0] ?? null);
                  set("logo", accepted[0] ?? null);
                }}
                className="text-sm text-ink-body file:mr-3 file:cursor-pointer file:rounded-full file:border file:border-line file:bg-paper file:px-3 file:py-1.5 file:text-ink"
              />
              {options.logo && <p className="truncate text-xs text-ink-body">Using {options.logo.name}</p>}
              {logoProblem && (
                <p role="alert" className="text-xs text-down">
                  {logoProblem}
                </p>
              )}
            </Field>
          )}
          <PositionGrid value={options.position} onChange={(position) => set("position", position)} />
          <Range label="Opacity" value={options.opacity} min={5} max={100} onChange={(v) => set("opacity", v)} />
          <Range
            label="Size"
            value={options.scale}
            min={5}
            max={100}
            format={(scale) => `${scale}% of the width`}
            onChange={(scale) => set("scale", scale)}
          />
          <KeepMetadata checked={options.keepMetadata} onChange={(keep) => set("keepMetadata", keep)} />
        </>
      }
    />
  );
}

function PositionGrid({ value, onChange }: { value: Position; onChange: (position: Position) => void }) {
  const name = useId();
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium text-ink-body">
        Position <span className="font-normal text-ink-meta">· {POSITION_LABELS[value]}</span>
      </legend>
      <div className="grid w-32 grid-cols-3 gap-1.5 rounded-lg border border-line bg-paper p-1.5">
        {POSITIONS.map((position) => (
          <label
            key={position}
            title={POSITION_LABELS[position]}
            className="group grid aspect-square cursor-pointer place-items-center rounded-md hover:bg-sand has-checked:bg-accent has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-1 has-[input:focus-visible]:outline-accent"
          >
            <input
              type="radio"
              name={name}
              value={position}
              checked={value === position}
              onChange={() => onChange(position)}
              aria-label={POSITION_LABELS[position]}
              className="sr-only"
            />
            <span aria-hidden="true" className="size-2 rounded-full bg-ink-faint group-has-checked:bg-paper" />
          </label>
        ))}
      </div>
    </fieldset>
  );
}
