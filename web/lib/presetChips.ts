/**
 * The resize chips from the design, grouped by platform. Chips that match an
 * API preset (lib/presets.ts, mirroring api/presets.py) are sent as that
 * preset; the rest are sent as a width and height.
 */

import { resizeParams, type Built, type Fit, type OutputFormat } from "./params";
import { PRESETS, type PresetId } from "./presets";

export type Chip = { id: string; label: string; width: number; height: number; apiPreset?: PresetId };
export type ChipGroup = { platform: string; chips: Chip[] };

function fromApi(id: PresetId): Pick<Chip, "width" | "height" | "apiPreset"> {
  const preset = PRESETS.find((p) => p.id === id);
  if (!preset) throw new Error(`unknown preset ${id}`);
  return { width: preset.width, height: preset.height, apiPreset: id };
}

export const CHIP_GROUPS: readonly ChipGroup[] = [
  {
    platform: "Instagram",
    chips: [
      { id: "ig-post", label: "1:1 Post", ...fromApi("instagram-post") },
      { id: "ig-portrait", label: "4:5 Portrait", width: 1080, height: 1350 },
      { id: "ig-story", label: "9:16 Story", ...fromApi("instagram-story") },
    ],
  },
  {
    platform: "X",
    chips: [
      { id: "x-post", label: "16:9 Post", width: 1600, height: 900 },
      { id: "x-header", label: "Header", ...fromApi("x-header") },
    ],
  },
  {
    platform: "LinkedIn",
    chips: [
      { id: "li-post", label: "Post", width: 1200, height: 1200 },
      { id: "li-banner", label: "Banner", ...fromApi("linkedin-banner") },
    ],
  },
  { platform: "YouTube", chips: [{ id: "yt-thumb", label: "Thumbnail", width: 1280, height: 720 }] },
  {
    platform: "WhatsApp & print",
    chips: [
      { id: "wa-dp", label: "WhatsApp DP", ...fromApi("whatsapp-dp") },
      { id: "passport", label: "Passport 35×45 mm", ...fromApi("passport") },
    ],
  },
];

export const CHIPS: readonly Chip[] = CHIP_GROUPS.flatMap((group) => group.chips);

export function findChip(id: string | null): Chip | undefined {
  return CHIPS.find((chip) => chip.id === id);
}

export type ResizeRequest = {
  /** The chosen chip, or null once the size has been typed by hand. */
  chipId: string | null;
  width: number;
  height: number;
  fit: Fit;
  format: OutputFormat;
  keepMetadata: boolean;
};

/** API params for the resize panel: the chip's preset when it has one, else the exact size. */
export function resizeRequest(request: ResizeRequest): Built {
  const chip = findChip(request.chipId);
  const common = { fit: request.fit, format: request.format, keepMetadata: request.keepMetadata };
  if (chip?.apiPreset && chip.width === request.width && chip.height === request.height) {
    return resizeParams({ ...common, mode: "preset", preset: chip.apiPreset, width: "", height: "" });
  }
  return resizeParams({
    ...common,
    mode: "custom",
    preset: "instagram-post",
    width: String(request.width),
    height: String(request.height),
  });
}
