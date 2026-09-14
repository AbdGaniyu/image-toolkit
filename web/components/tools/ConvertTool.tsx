"use client";

import { useState } from "react";
import { Choice, KeepMetadata, Range } from "@/components/fields";
import ToolWorkspace from "@/components/ToolWorkspace";
import { convertParams, type ConvertOptions, type OutputFormat } from "@/lib/params";
import { TOOL_BY_SLUG } from "@/lib/tools";

const FORMATS = [
  { value: "jpg", label: "JPG" },
  { value: "png", label: "PNG" },
  { value: "webp", label: "WEBP" },
] as const;

const FORMAT_HINTS: Record<OutputFormat, string> = {
  jpg: "Best for photos, and opens everywhere. No transparency.",
  png: "Lossless and keeps transparency, but files are the largest.",
  webp: "The smallest files, keeps transparency. Opens in all current browsers.",
};

export default function ConvertTool() {
  const [options, setOptions] = useState<ConvertOptions>({ format: "webp", quality: 80, keepMetadata: false });
  const set = <K extends keyof ConvertOptions>(key: K, value: ConvertOptions[K]) =>
    setOptions((current) => ({ ...current, [key]: value }));

  return (
    <ToolWorkspace
      tool={TOOL_BY_SLUG.convert}
      buildParams={() => convertParams(options)}
      options={
        <>
          <Choice
            legend="Format"
            value={options.format}
            options={FORMATS}
            hint={FORMAT_HINTS[options.format]}
            onChange={(format) => set("format", format)}
          />
          {options.format === "png" ? (
            <p className="text-xs text-ink-meta">PNG is lossless, so there’s no quality to choose.</p>
          ) : (
            <Range
              label="Quality"
              value={options.quality}
              min={1}
              max={100}
              format={(quality) => `${quality}`}
              onChange={(quality) => set("quality", quality)}
            />
          )}
          <KeepMetadata checked={options.keepMetadata} onChange={(keep) => set("keepMetadata", keep)} />
        </>
      }
    />
  );
}
