/**
 * Turns each tool's settings into the API's form fields (see the endpoint
 * table in the README), or says in plain words what's missing.
 */

import type { Params } from "./api";
import type { PresetId } from "./presets";

export type OutputFormat = "jpg" | "png" | "webp";
export type Fit = "cover" | "contain";
export type Built = { ok: true; params: Params } | { ok: false; error: string };

const MAX_SIDE = 10_000;
const MAX_TEXT = 100;

export type RemoveBgOptions = { keepMetadata: boolean };

export function removeBgParams(options: RemoveBgOptions): Built {
  return { ok: true, params: { keep_metadata: options.keepMetadata } };
}

export type ResizeOptions = {
  mode: "preset" | "custom";
  preset: PresetId;
  /** As typed. Leave one blank and the API keeps the proportions. */
  width: string;
  height: string;
  fit: Fit;
  format: OutputFormat | "same";
  keepMetadata: boolean;
};

export function resizeParams(options: ResizeOptions): Built {
  const params: Params = { fit: options.fit, keep_metadata: options.keepMetadata };
  if (options.format !== "same") params.format = options.format;
  if (options.mode === "preset") return { ok: true, params: { ...params, preset: options.preset } };

  const width = parseSide(options.width);
  const height = parseSide(options.height);
  if (width === "invalid" || height === "invalid") {
    return {
      ok: false,
      error: `Width and height must be whole numbers from 1 to ${MAX_SIDE.toLocaleString("en")}.`,
    };
  }
  if (width === null && height === null) return { ok: false, error: "Enter a width, a height, or both." };
  if (width !== null) params.width = width;
  if (height !== null) params.height = height;
  return { ok: true, params };
}

export type ConvertOptions = { format: OutputFormat; quality: number; keepMetadata: boolean };

export function convertParams(options: ConvertOptions): Built {
  const params: Params = { format: options.format, keep_metadata: options.keepMetadata };
  // PNG is lossless, so the API has no use for a quality.
  if (options.format !== "png") params.quality = clamp(Math.round(options.quality), 1, 100);
  return { ok: true, params };
}

/** The API's 9-grid, in reading order. */
export const POSITIONS = [
  "top-left",
  "top",
  "top-right",
  "left",
  "center",
  "right",
  "bottom-left",
  "bottom",
  "bottom-right",
] as const;
export type Position = (typeof POSITIONS)[number];

export type WatermarkOptions = {
  kind: "text" | "logo";
  text: string;
  logo: File | null;
  position: Position;
  /** 5-100, as the sliders show them; the API takes 0.05-1. */
  opacity: number;
  scale: number;
  /** #rrggbb, for text. */
  color: string;
  keepMetadata: boolean;
};

export function watermarkParams(options: WatermarkOptions): Built {
  const params: Params = {
    position: options.position,
    opacity: clamp(options.opacity, 5, 100) / 100,
    scale: clamp(options.scale, 5, 100) / 100,
    keep_metadata: options.keepMetadata,
  };
  if (options.kind === "logo") {
    if (!options.logo) return { ok: false, error: "Choose a logo image." };
    return { ok: true, params: { ...params, logo: options.logo } };
  }
  const text = options.text.trim().replace(/\s+/g, " ");
  if (!text) return { ok: false, error: "Type the text for the watermark." };
  if (text.length > MAX_TEXT) return { ok: false, error: `Keep the watermark text to ${MAX_TEXT} characters.` };
  if (!/^#[0-9a-f]{6}$/i.test(options.color)) return { ok: false, error: "Pick a colour for the text." };
  return { ok: true, params: { ...params, text, color: options.color.toLowerCase() } };
}

function parseSide(text: string): number | null | "invalid" {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) return "invalid";
  const value = Number(trimmed);
  return value >= 1 && value <= MAX_SIDE ? value : "invalid";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
