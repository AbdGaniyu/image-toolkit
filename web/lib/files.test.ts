import { describe, expect, it } from "vitest";
import { checkFiles, filesFromTransfer, formatBytes, isSupportedImage, MAX_UPLOAD_BYTES } from "./files";

function file(name: string, type: string, size = 10): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe("isSupportedImage", () => {
  it.each([
    ["photo.jpg", "image/jpeg"],
    ["photo.png", "image/png"],
    ["photo.webp", "image/webp"],
    ["IMG_0001.HEIC", "image/heic"],
    ["IMG_0001.heif", "image/heif"],
    ["IMG_0001.HEIC", ""], // Chrome on Windows: no MIME type for HEIC
    ["IMG_0001.heic", "application/octet-stream"],
  ])("accepts %s (%s)", (name, type) => {
    expect(isSupportedImage(file(name, type))).toBe(true);
  });

  it.each([
    ["anim.gif", "image/gif"],
    ["pic.avif", "image/avif"],
    ["notes.pdf", "application/pdf"],
    ["notes", ""],
    ["fake.jpg.exe", "application/octet-stream"],
  ])("rejects %s (%s)", (name, type) => {
    expect(isSupportedImage(file(name, type))).toBe(false);
  });
});

describe("checkFiles", () => {
  it("accepts good images up to the limit", () => {
    const a = file("a.jpg", "image/jpeg");
    expect(checkFiles([a])).toEqual({ accepted: [a], rejected: [] });
  });

  it("explains each rejection", () => {
    const { accepted, rejected } = checkFiles(
      [
        file("notes.pdf", "application/pdf"),
        file("empty.png", "image/png", 0),
        file("huge.jpg", "image/jpeg", MAX_UPLOAD_BYTES + 1),
        file("ok.webp", "image/webp"),
      ],
      1,
    );
    expect(accepted.map((f) => f.name)).toEqual(["ok.webp"]);
    expect(rejected).toEqual([
      "notes.pdf isn’t a JPG, PNG, WEBP or HEIC image.",
      "empty.png is empty.",
      "huge.jpg is 15.0 MB; images must be 15 MB or smaller.",
    ]);
  });

  it("allows exactly 15 MB", () => {
    expect(checkFiles([file("edge.jpg", "image/jpeg", MAX_UPLOAD_BYTES)]).accepted).toHaveLength(1);
  });

  it("takes the first image when only one is wanted", () => {
    const { accepted, rejected } = checkFiles([file("a.jpg", "image/jpeg"), file("b.jpg", "image/jpeg")]);
    expect(accepted.map((f) => f.name)).toEqual(["a.jpg"]);
    expect(rejected).toEqual(["b.jpg wasn’t used: one image at a time."]);
  });

  it("caps a batch", () => {
    const files = Array.from({ length: 12 }, (_, i) => file(`${i}.png`, "image/png"));
    const { accepted, rejected } = checkFiles(files, 10);
    expect(accepted).toHaveLength(10);
    expect(rejected).toEqual(["10.png wasn’t added: up to 10 images at a time.", "11.png wasn’t added: up to 10 images at a time."]);
  });

  it("names nameless pasted images", () => {
    expect(checkFiles([file("", "text/plain")]).rejected).toEqual([
      "The pasted image isn’t a JPG, PNG, WEBP or HEIC image.",
    ]);
  });
});

describe("filesFromTransfer", () => {
  const png = file("image.png", "image/png");

  it("reads files from a drop", () => {
    expect(filesFromTransfer({ files: [png] })).toEqual([png]);
  });

  it("falls back to items for pasted images", () => {
    const items = [
      { kind: "string", getAsFile: () => null },
      { kind: "file", getAsFile: () => png },
    ];
    expect(filesFromTransfer({ files: [], items })).toEqual([png]);
  });

  it("returns nothing for text pastes or no transfer", () => {
    expect(filesFromTransfer({ files: [], items: [{ kind: "string", getAsFile: () => null }] })).toEqual([]);
    expect(filesFromTransfer(null)).toEqual([]);
  });
});

describe("formatBytes", () => {
  it.each([
    [812, "812 B"],
    [340 * 1024, "340 KB"],
    [2.4 * 1024 * 1024, "2.4 MB"],
  ])("%d -> %s", (bytes, text) => {
    expect(formatBytes(bytes)).toBe(text);
  });
});
