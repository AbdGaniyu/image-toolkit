import { describe, expect, it } from "vitest";
import { ApiError, apiUrlFrom, filenameFrom, processImage, type Progress } from "./api";

type Handler = (() => void) | null;

/** Just enough XMLHttpRequest to drive processImage from a test. */
class FakeXhr {
  method = "";
  url = "";
  body: FormData | null = null;
  timeout = 0;
  responseType = "";
  status = 0;
  response: Blob | null = null;
  private headers: Record<string, string> = {};
  upload: {
    onprogress: ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null;
    onload: Handler;
  } = { onprogress: null, onload: null };
  onload: Handler = null;
  onerror: Handler = null;
  ontimeout: Handler = null;
  onabort: Handler = null;

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  send(body: FormData) {
    this.body = body;
  }
  abort() {
    this.onabort?.();
  }
  getResponseHeader(name: string) {
    return this.headers[name.toLowerCase()] ?? null;
  }

  // Test controls
  progress(loaded: number, total: number) {
    this.upload.onprogress?.({ lengthComputable: true, loaded, total });
  }
  respond(status: number, body: BlobPart, headers: Record<string, string> = {}) {
    this.upload.onload?.();
    this.status = status;
    this.headers = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
    this.response = new Blob([body], { type: this.headers["content-type"] });
    this.onload?.();
  }
}

function fakes() {
  const made: FakeXhr[] = [];
  return {
    made,
    createXhr: () => {
      const xhr = new FakeXhr();
      made.push(xhr);
      return xhr as unknown as XMLHttpRequest;
    },
  };
}

/** The ApiError a request rejected with; fails the test if it resolved. */
async function rejection(pending: Promise<unknown>): Promise<ApiError> {
  try {
    await pending;
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    return error as ApiError;
  }
  throw new Error("expected the request to fail");
}

const photo = () => new File(["jpeg bytes"], "photo.jpg", { type: "image/jpeg" });
const PNG_HEADERS = { "Content-Type": "image/png", "Content-Disposition": 'attachment; filename="photo-nobg.png"' };
const JSON_HEADERS = { "Content-Type": "application/json" };

describe("processImage", () => {
  it("posts the file and params as multipart to the endpoint", async () => {
    const { made, createXhr } = fakes();
    const logo = new File(["png"], "logo.png", { type: "image/png" });
    const pending = processImage(
      "watermark",
      photo(),
      { logo, position: "top", opacity: 0.5, keep_metadata: true, text: undefined, format: null },
      { apiUrl: "https://api.test", createXhr },
    );
    const xhr = made[0];
    expect([xhr.method, xhr.url, xhr.responseType, xhr.timeout]).toEqual(["POST", "https://api.test/watermark", "blob", 60_000]);

    const body = xhr.body!;
    expect((body.get("file") as File).name).toBe("photo.jpg");
    expect((body.get("logo") as File).name).toBe("logo.png");
    expect([body.get("position"), body.get("opacity"), body.get("keep_metadata")]).toEqual(["top", "0.5", "true"]);
    expect(body.has("text") || body.has("format")).toBe(false);

    xhr.respond(200, "png bytes", PNG_HEADERS);
    await pending;
  });

  it("reports upload progress, then processing", async () => {
    const { made, createXhr } = fakes();
    const seen: Progress[] = [];
    const pending = processImage("convert", photo(), { format: "webp" }, { createXhr, onProgress: (p) => seen.push(p) });
    made[0].progress(50, 200);
    made[0].progress(200, 200);
    made[0].respond(200, "webp", { "Content-Type": "image/webp" });
    await pending;
    expect(seen).toEqual([
      { phase: "uploading", percent: 0 },
      { phase: "uploading", percent: 25 },
      { phase: "uploading", percent: 100 },
      { phase: "processing" },
    ]);
  });

  it("resolves with the image, its type and the API's filename", async () => {
    const { made, createXhr } = fakes();
    const pending = processImage("remove-bg", photo(), {}, { createXhr });
    made[0].respond(200, "png bytes", PNG_HEADERS);
    const result = await pending;
    expect(result.filename).toBe("photo-nobg.png");
    expect(result.type).toBe("image/png");
    expect(await result.blob.text()).toBe("png bytes");
  });

  it("names the file itself when the header is missing", async () => {
    const { made, createXhr } = fakes();
    const pending = processImage("convert", photo(), { format: "webp" }, { createXhr });
    made[0].respond(200, "webp", { "Content-Type": "image/webp" });
    expect((await pending).filename).toBe("photo.webp");
  });

  it("passes on the API's error code and message", async () => {
    const { made, createXhr } = fakes();
    const pending = processImage("convert", photo(), { format: "jpg" }, { createXhr });
    made[0].respond(
      415,
      JSON.stringify({ code: "unsupported_type", message: "That file type isn't supported." }),
      JSON_HEADERS,
    );
    const error = await rejection(pending);
    expect([error.code, error.message, error.status, error.retryable]).toEqual([
      "unsupported_type",
      "That file type isn't supported.",
      415,
      false,
    ]);
  });

  it("treats unknown API codes as http_error but keeps the message", async () => {
    const { made, createXhr } = fakes();
    const pending = processImage("convert", photo(), {}, { createXhr });
    made[0].respond(400, JSON.stringify({ code: "brand_new", message: "Something new." }), JSON_HEADERS);
    const error = await rejection(pending);
    expect([error.code, error.message]).toEqual(["http_error", "Something new."]);
  });

  it("explains a server failure and offers a retry", async () => {
    const { made, createXhr } = fakes();
    const pending = processImage("remove-bg", photo(), {}, { createXhr });
    made[0].respond(502, "<html>Bad gateway</html>", { "Content-Type": "text/html" });
    const error = await rejection(pending);
    expect([error.code, error.status, error.retryable]).toEqual(["http_error", 502, true]);
    expect(error.message).toContain("error 502");
  });

  it("turns a proxy's 413 page into file_too_large", async () => {
    const { made, createXhr } = fakes();
    const pending = processImage("resize", photo(), {}, { createXhr });
    made[0].respond(413, "<html>Request Entity Too Large</html>", { "Content-Type": "text/html" });
    expect((await rejection(pending)).code).toBe("file_too_large");
  });

  it("rejects a success that isn't an image", async () => {
    const { made, createXhr } = fakes();
    const pending = processImage("resize", photo(), {}, { createXhr });
    made[0].respond(200, "{}", JSON_HEADERS);
    expect((await rejection(pending)).code).toBe("bad_response");
  });

  it("reports network failures and timeouts as retryable", async () => {
    const { made, createXhr } = fakes();
    const offline = processImage("resize", photo(), {}, { createXhr });
    made[0].onerror?.();
    const slow = processImage("resize", photo(), {}, { createXhr, timeoutMs: 5_000 });
    expect(made[1].timeout).toBe(5_000);
    made[1].ontimeout?.();

    const [network, timeout] = await Promise.all([rejection(offline), rejection(slow)]);
    expect([network.code, network.retryable]).toEqual(["network", true]);
    expect([timeout.code, timeout.retryable, timeout.message]).toEqual([
      "timeout",
      true,
      "That took longer than 5 seconds. Try again.",
    ]);
  });

  it("cancels through an AbortSignal", async () => {
    const { made, createXhr } = fakes();
    const controller = new AbortController();
    const pending = processImage("resize", photo(), {}, { createXhr, signal: controller.signal });
    controller.abort();
    const error = await rejection(pending);
    expect([error.code, error.retryable]).toEqual(["aborted", false]);
    expect(made).toHaveLength(1);
  });

  it("doesn't send when already cancelled", async () => {
    const { made, createXhr } = fakes();
    const controller = new AbortController();
    controller.abort();
    const error = await rejection(processImage("resize", photo(), {}, { createXhr, signal: controller.signal }));
    expect(error.code).toBe("aborted");
    expect(made).toHaveLength(0);
  });
});

describe("apiUrlFrom", () => {
  it("defaults to the local API outside production", () => {
    expect(apiUrlFrom(undefined, "development")).toBe("http://localhost:8000");
    expect(apiUrlFrom("http://192.168.1.5:8000/", "test")).toBe("http://192.168.1.5:8000");
  });

  it("accepts an https URL in production, minus trailing slashes", () => {
    expect(apiUrlFrom("https://api.example.com//", "production")).toBe("https://api.example.com");
  });

  it.each([
    ["http://api.example.com", '"http://api.example.com"'],
    ["api.example.com", '"api.example.com"'],
    [undefined, "nothing (it isn't set)"],
    ["", "nothing (it isn't set)"],
  ])("refuses %j in production, naming the variable", (value, got) => {
    expect(() => apiUrlFrom(value, "production")).toThrow(
      `NEXT_PUBLIC_API_URL must start with https:// in a production build; got ${got}.`,
    );
  });
});

describe("filenameFrom", () => {
  it.each([
    ['attachment; filename="photo-nobg.png"', "photo-nobg.png"],
    ["attachment; filename=banner-1080x1080.jpg", "banner-1080x1080.jpg"],
    ["attachment; filename*=UTF-8''My%20Photo.png", "My Photo.png"],
    ['attachment; filename="a.png"; filename*=UTF-8\'\'b%C3%A9.png', "bé.png"],
    ['attachment; filename="../../etc/passwd"', ".._.._etc_passwd"],
    ["attachment", null],
    [null, null],
  ])("%s -> %s", (header, name) => {
    expect(filenameFrom(header)).toBe(name);
  });
});
