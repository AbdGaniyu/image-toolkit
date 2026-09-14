import { describe, expect, it } from "vitest";
import {
  convertParams,
  removeBgParams,
  resizeParams,
  watermarkParams,
  type ResizeOptions,
  type WatermarkOptions,
} from "./params";

function resize(overrides: Partial<ResizeOptions> = {}): ResizeOptions {
  return {
    mode: "preset",
    preset: "instagram-post",
    width: "",
    height: "",
    fit: "cover",
    format: "same",
    keepMetadata: false,
    ...overrides,
  };
}

function watermark(overrides: Partial<WatermarkOptions> = {}): WatermarkOptions {
  return {
    kind: "text",
    text: "© Studio",
    logo: null,
    position: "bottom-right",
    opacity: 50,
    scale: 25,
    color: "#FFFFFF",
    keepMetadata: false,
    ...overrides,
  };
}

describe("removeBgParams", () => {
  it("only carries keep_metadata", () => {
    expect(removeBgParams({ keepMetadata: true })).toEqual({ ok: true, params: { keep_metadata: true } });
  });
});

describe("resizeParams", () => {
  it("sends a preset, leaving the format to the API", () => {
    expect(resizeParams(resize())).toEqual({
      ok: true,
      params: { preset: "instagram-post", fit: "cover", keep_metadata: false },
    });
  });

  it("sends a chosen format", () => {
    expect(resizeParams(resize({ format: "webp" }))).toMatchObject({ ok: true, params: { format: "webp" } });
  });

  it("ignores custom sizes in preset mode", () => {
    expect(resizeParams(resize({ width: "abc" })).ok).toBe(true);
  });

  it("sends custom sizes, either side optional", () => {
    expect(resizeParams(resize({ mode: "custom", width: " 1200 " }))).toEqual({
      ok: true,
      params: { width: 1200, fit: "cover", keep_metadata: false },
    });
    expect(resizeParams(resize({ mode: "custom", width: "800", height: "600", fit: "contain" }))).toEqual({
      ok: true,
      params: { width: 800, height: 600, fit: "contain", keep_metadata: false },
    });
  });

  it("needs at least one side", () => {
    expect(resizeParams(resize({ mode: "custom" }))).toEqual({ ok: false, error: "Enter a width, a height, or both." });
  });

  it.each(["0", "10001", "12.5", "abc", "-5", "1e3"])("rejects %s", (width) => {
    expect(resizeParams(resize({ mode: "custom", width }))).toEqual({
      ok: false,
      error: "Width and height must be whole numbers from 1 to 10,000.",
    });
  });
});

describe("convertParams", () => {
  it("sends format and quality", () => {
    expect(convertParams({ format: "webp", quality: 80, keepMetadata: false })).toEqual({
      ok: true,
      params: { format: "webp", quality: 80, keep_metadata: false },
    });
  });

  it("leaves quality out for PNG", () => {
    expect(convertParams({ format: "png", quality: 80, keepMetadata: true })).toEqual({
      ok: true,
      params: { format: "png", keep_metadata: true },
    });
  });

  it("keeps quality within 1-100", () => {
    expect(convertParams({ format: "jpg", quality: 0, keepMetadata: false })).toMatchObject({ params: { quality: 1 } });
    expect(convertParams({ format: "jpg", quality: 250, keepMetadata: false })).toMatchObject({
      params: { quality: 100 },
    });
  });
});

describe("watermarkParams", () => {
  it("sends text on one line, with the sliders as fractions", () => {
    expect(watermarkParams(watermark({ text: "  © Studio \n Lagos ", opacity: 55, scale: 7 }))).toEqual({
      ok: true,
      params: {
        text: "© Studio Lagos",
        color: "#ffffff",
        position: "bottom-right",
        opacity: 0.55,
        scale: 0.07,
        keep_metadata: false,
      },
    });
  });

  it("asks for text", () => {
    expect(watermarkParams(watermark({ text: "   " }))).toEqual({ ok: false, error: "Type the text for the watermark." });
  });

  it("caps the text at 100 characters", () => {
    expect(watermarkParams(watermark({ text: "x".repeat(100) })).ok).toBe(true);
    expect(watermarkParams(watermark({ text: "x".repeat(101) }))).toEqual({
      ok: false,
      error: "Keep the watermark text to 100 characters.",
    });
  });

  it("rejects a colour that isn't #rrggbb", () => {
    expect(watermarkParams(watermark({ color: "white" })).ok).toBe(false);
  });

  it("sends the logo instead of text", () => {
    const logo = new File(["png"], "logo.png", { type: "image/png" });
    const built = watermarkParams(watermark({ kind: "logo", logo, position: "top" }));
    expect(built).toEqual({
      ok: true,
      params: { logo, position: "top", opacity: 0.5, scale: 0.25, keep_metadata: false },
    });
  });

  it("asks for a logo", () => {
    expect(watermarkParams(watermark({ kind: "logo" }))).toEqual({ ok: false, error: "Choose a logo image." });
  });
});
