"use client";

import { useId, useState } from "react";
import { Choice, Field, INPUT, KeepMetadata } from "@/components/fields";
import ToolWorkspace from "@/components/ToolWorkspace";
import { resizeParams, type ResizeOptions } from "@/lib/params";
import { PRESETS, type PresetId } from "@/lib/presets";
import { TOOL_BY_SLUG } from "@/lib/tools";

const FORMATS = [
  { value: "same", label: "Same as original" },
  { value: "jpg", label: "JPG" },
  { value: "png", label: "PNG" },
  { value: "webp", label: "WEBP" },
] as const;

export default function ResizeTool() {
  const [options, setOptions] = useState<ResizeOptions>({
    mode: "preset",
    preset: "instagram-post",
    width: "",
    height: "",
    fit: "cover",
    format: "same",
    keepMetadata: false,
  });
  const set = <K extends keyof ResizeOptions>(key: K, value: ResizeOptions[K]) =>
    setOptions((current) => ({ ...current, [key]: value }));
  const presetId = useId();
  const widthId = useId();
  const heightId = useId();
  const formatId = useId();

  return (
    <ToolWorkspace
      tool={TOOL_BY_SLUG.resize}
      buildParams={() => resizeParams(options)}
      options={
        <>
          <Choice
            legend="Size"
            value={options.mode}
            options={[
              { value: "preset", label: "Preset" },
              { value: "custom", label: "Custom" },
            ]}
            onChange={(mode) => set("mode", mode)}
          />
          {options.mode === "preset" ? (
            <Field label="Preset" htmlFor={presetId}>
              <select
                id={presetId}
                value={options.preset}
                onChange={(event) => set("preset", event.target.value as PresetId)}
                className={INPUT}
              >
                {PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label} · {preset.width}×{preset.height}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Width (px)" htmlFor={widthId}>
                <input
                  id={widthId}
                  inputMode="numeric"
                  placeholder="auto"
                  value={options.width}
                  onChange={(event) => set("width", event.target.value)}
                  className={INPUT}
                />
              </Field>
              <Field label="Height (px)" htmlFor={heightId}>
                <input
                  id={heightId}
                  inputMode="numeric"
                  placeholder="auto"
                  value={options.height}
                  onChange={(event) => set("height", event.target.value)}
                  className={INPUT}
                />
              </Field>
              <p className="col-span-2 text-xs text-ink-meta">Leave one blank to keep the proportions.</p>
            </div>
          )}
          <Choice
            legend="Fit"
            value={options.fit}
            options={[
              { value: "cover", label: "Crop to fill" },
              { value: "contain", label: "Fit inside" },
            ]}
            hint={
              options.fit === "cover"
                ? "Trims the edges so the picture fills the size exactly."
                : "Keeps the whole picture and pads the rest."
            }
            onChange={(fit) => set("fit", fit)}
          />
          <Field label="Format" htmlFor={formatId}>
            <select
              id={formatId}
              value={options.format}
              onChange={(event) => set("format", event.target.value as ResizeOptions["format"])}
              className={INPUT}
            >
              {FORMATS.map((format) => (
                <option key={format.value} value={format.value}>
                  {format.label}
                </option>
              ))}
            </select>
          </Field>
          <KeepMetadata checked={options.keepMetadata} onChange={(keep) => set("keepMetadata", keep)} />
        </>
      }
    />
  );
}
