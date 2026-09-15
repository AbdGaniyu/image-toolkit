/**
 * Browser-side helpers for the workspace's live feedback. The real work is
 * always done by the API; these only preview it or dress its result.
 */

import type { OutputFormat, Position } from "./params";
import { POSITIONS } from "./params";

const MIME: Record<OutputFormat, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

/** Decodes an image URL, or null if this browser can't (HEIC outside Safari). */
export function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Roughly what the converted file will weigh: the browser's own encoder at the
 * chosen quality. The API's encoder differs a little, so treat it as an estimate.
 */
export async function estimateSize(image: HTMLImageElement, format: OutputFormat, quality: number): Promise<number | null> {
  const scale = Math.min(1, 4000 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await toBlob(canvas, MIME[format], quality / 100);
  if (!blob) return null;
  return Math.round(blob.size / (scale * scale)); // scale back up if we shrank a huge image
}

/** The cut-out laid over a solid colour, as a PNG. */
export async function withBackground(cutout: Blob, color: string): Promise<Blob> {
  const url = URL.createObjectURL(cutout);
  try {
    const image = await loadImage(url);
    if (!image) throw new Error("couldn't read the cut-out");
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("no 2D canvas");
    context.fillStyle = color;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0);
    const blob = await toBlob(canvas, "image/png");
    if (!blob) throw new Error("couldn't encode the PNG");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export type WatermarkPreview = {
  kind: "text" | "logo";
  text: string;
  logo: HTMLImageElement | null;
  position: Position;
  /** 5-100 */
  opacity: number;
  /** Watermark width as a % of the image width. */
  scale: number;
};

const ANCHORS: Record<Position, [number, number]> = {
  "top-left": [0, 0], top: [0.5, 0], "top-right": [1, 0],
  left: [0, 0.5], center: [0.5, 0.5], right: [1, 0.5],
  "bottom-left": [0, 1], bottom: [0.5, 1], "bottom-right": [1, 1],
}; // prettier-ignore

/**
 * Draws only the mark onto a transparent canvas the size of the image, placed
 * the way api/ops/watermark.py places it: 3% margin, width as a share of the
 * image width, shrunk to fit, white text with a dark outline.
 */
export function drawWatermarkPreview(canvas: HTMLCanvasElement, width: number, height: number, mark: WatermarkPreview): void {
  const scaleDown = Math.min(1, 2000 / Math.max(width, height)); // plenty for a preview
  const w = Math.max(1, Math.round(width * scaleDown));
  const h = Math.max(1, Math.round(height * scaleDown));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, w, h);

  const margin = Math.round(0.03 * Math.min(w, h));
  const freeW = Math.max(1, w - 2 * margin);
  const freeH = Math.max(1, h - 2 * margin);
  const targetW = Math.min(Math.max(1, Math.round((mark.scale / 100) * w)), freeW);
  const [fx, fy] = ANCHORS[mark.position];
  const place = (markW: number, markH: number) => ({
    x: Math.min(Math.max(0, margin + Math.round(fx * (freeW - markW))), w - markW),
    y: Math.min(Math.max(0, margin + Math.round(fy * (freeH - markH))), h - markH),
  });

  context.globalAlpha = mark.opacity / 100;
  if (mark.kind === "logo") {
    if (!mark.logo) return;
    let markW = targetW;
    let markH = Math.round((mark.logo.naturalHeight * markW) / mark.logo.naturalWidth);
    if (markH > freeH) {
      markH = freeH;
      markW = Math.round((mark.logo.naturalWidth * markH) / mark.logo.naturalHeight);
    }
    const { x, y } = place(markW, markH);
    context.drawImage(mark.logo, x, y, markW, markH);
  } else {
    const text = mark.text.trim().replace(/\s+/g, " ");
    if (!text) return;
    const family = getComputedStyle(document.body).fontFamily || "sans-serif";
    context.font = `500 100px ${family}`;
    const measured = context.measureText(text);
    const inkH = measured.actualBoundingBoxAscent + measured.actualBoundingBoxDescent || 100;
    const size = Math.max(1, Math.floor(100 * Math.min(targetW / Math.max(1, measured.width), freeH / inkH)));
    context.font = `500 ${size}px ${family}`;
    const m = context.measureText(text);
    const markH = Math.ceil(m.actualBoundingBoxAscent + m.actualBoundingBoxDescent);
    const { x, y } = place(Math.ceil(m.width), markH);
    context.textBaseline = "alphabetic";
    context.lineJoin = "round";
    context.lineWidth = Math.max(1, Math.round(size / 15));
    context.strokeStyle = "#000000";
    context.fillStyle = "#ffffff";
    context.strokeText(text, x, y + m.actualBoundingBoxAscent);
    context.fillText(text, x, y + m.actualBoundingBoxAscent);
  }
  context.globalAlpha = 1;
}

/** The 9-grid in reading order, for the position picker. */
export const GRID: readonly Position[] = POSITIONS;
