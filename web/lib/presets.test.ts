import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PRESETS } from "./presets";

// api/presets.py is the source of truth: read its PRESETS entries.
const source = readFileSync(new URL("../../api/presets.py", import.meta.url), "utf8");
const SIZE = String.raw`(\d+|_mm_to_px\([^)]*\))`;
const ENTRY = new RegExp(
  String.raw`"([\w-]+)":\s*Preset\(\s*"([^"]+)",\s*${SIZE},\s*${SIZE}(?:,\s*dpi=(\d+))?\s*\)`,
  "g",
);

function pixels(expression: string): number {
  const mm = /_mm_to_px\(\s*([\d.]+),\s*(\d+)\s*\)/.exec(expression);
  return mm ? Math.round((Number(mm[1]) / 25.4) * Number(mm[2])) : Number(expression);
}

describe("PRESETS", () => {
  it("mirrors api/presets.py", () => {
    const api = [...source.matchAll(ENTRY)].map(([, id, label, width, height, dpi]) => ({
      id,
      label,
      width: pixels(width),
      height: pixels(height),
      dpi: dpi ? Number(dpi) : null,
    }));
    const web = PRESETS.map((preset) => ({
      id: preset.id,
      label: preset.label,
      width: preset.width,
      height: preset.height,
      dpi: "dpi" in preset ? preset.dpi : null,
    }));
    expect(api.length).toBeGreaterThan(0);
    expect(web).toEqual(api);
  });
});
