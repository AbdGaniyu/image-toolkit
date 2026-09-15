import { describe, expect, it } from "vitest";
import { CHIPS, resizeRequest } from "./presetChips";
import { PRESETS } from "./presets";

describe("CHIPS", () => {
  it("offers every API preset, at the API's size", () => {
    for (const preset of PRESETS) {
      const chip = CHIPS.find((c) => c.apiPreset === preset.id);
      expect(chip, preset.id).toBeDefined();
      expect([chip!.width, chip!.height]).toEqual([preset.width, preset.height]);
    }
  });

  it("has unique ids", () => {
    expect(new Set(CHIPS.map((c) => c.id)).size).toBe(CHIPS.length);
  });
});

describe("resizeRequest", () => {
  const base = { fit: "cover", format: "jpg", keepMetadata: false } as const;

  it("sends an API preset when the chip has one and the size is untouched", () => {
    expect(resizeRequest({ ...base, chipId: "passport", width: 413, height: 531 })).toEqual({
      ok: true,
      params: { preset: "passport", fit: "cover", format: "jpg", keep_metadata: false },
    });
  });

  it("sends the size for chips the API has no preset for", () => {
    expect(resizeRequest({ ...base, chipId: "ig-portrait", width: 1080, height: 1350 })).toEqual({
      ok: true,
      params: { width: 1080, height: 1350, fit: "cover", format: "jpg", keep_metadata: false },
    });
  });

  it("sends the typed size once it no longer matches the chip", () => {
    expect(resizeRequest({ ...base, chipId: "ig-post", width: 1080, height: 900 })).toMatchObject({
      ok: true,
      params: { width: 1080, height: 900 },
    });
  });

  it("explains an impossible size", () => {
    expect(resizeRequest({ ...base, chipId: null, width: 0, height: 900 })).toEqual({
      ok: false,
      error: "Width and height must be whole numbers from 1 to 10,000.",
    });
  });
});
