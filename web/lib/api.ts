/**
 * The one way the web app talks to the image API (api/): POST an image plus
 * params, report upload progress, get the processed image back. The API is
 * stateless, so nothing is stored anywhere.
 *
 * Uses XMLHttpRequest rather than fetch because fetch can't report upload
 * progress.
 */

/** Base URL of the image API, from NEXT_PUBLIC_API_URL. */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/+$/, "");
export const TIMEOUT_MS = 60_000;

export type Endpoint = "remove-bg" | "resize" | "convert" | "watermark";

/** Codes the API sends (README, "Errors"). */
const SERVER_CODES = [
  "empty_file",
  "invalid_image",
  "file_too_large",
  "image_too_large",
  "unsupported_type",
  "missing_file",
  "invalid_params",
  "not_found",
  "method_not_allowed",
  "http_error",
] as const;

/** The API's codes, plus the ones only the browser can see. */
export type ApiErrorCode = (typeof SERVER_CODES)[number] | "network" | "timeout" | "aborted" | "bad_response";

/** A request that didn't produce an image, with a message fit to show the user. */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  /** HTTP status, or null when there was no response (network, timeout, cancelled). */
  readonly status: number | null;

  constructor(code: ApiErrorCode, message: string, status: number | null = null) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }

  /** Worth a "Try again" button: the same request may well work next time. */
  get retryable(): boolean {
    return this.code === "network" || this.code === "timeout" || (this.status !== null && this.status >= 500);
  }
}

export type Progress = { phase: "uploading"; percent: number } | { phase: "processing" };

export type ApiResult = {
  blob: Blob;
  /** From the API's Content-Disposition, e.g. "photo-nobg.png". */
  filename: string;
  type: string;
};

/** Form fields. Blobs (a watermark logo) go as files; null and undefined are left out. */
export type Params = Record<string, string | number | boolean | Blob | null | undefined>;

export type Options = {
  /** "uploading" with a percentage while the file goes up, then "processing" until the image comes back. */
  onProgress?: (progress: Progress) => void;
  signal?: AbortSignal;
  timeoutMs?: number;
  apiUrl?: string;
  /** Tests pass a fake. */
  createXhr?: () => XMLHttpRequest;
};

/**
 * Sends `file` to an endpoint and resolves with the processed image. Rejects
 * with an ApiError: the API's own code and message, or network / timeout
 * (after 60 s, covering upload and processing) / aborted / bad_response.
 */
export function processImage(
  endpoint: Endpoint,
  file: File,
  params: Params = {},
  options: Options = {},
): Promise<ApiResult> {
  const {
    onProgress,
    signal,
    timeoutMs = TIMEOUT_MS,
    apiUrl = API_URL,
    createXhr = () => new XMLHttpRequest(),
  } = options;

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(cancelled());
      return;
    }

    const xhr = createXhr();
    const abortRequest = () => xhr.abort();
    const done = () => signal?.removeEventListener("abort", abortRequest);
    const fail = (error: ApiError) => {
      done();
      reject(error);
    };

    xhr.open("POST", `${apiUrl}/${endpoint}`);
    xhr.responseType = "blob";
    xhr.timeout = timeoutMs;
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total <= 0) return;
      onProgress?.({ phase: "uploading", percent: Math.min(100, Math.round((event.loaded / event.total) * 100)) });
    };
    xhr.upload.onload = () => onProgress?.({ phase: "processing" });
    xhr.onload = () => {
      done();
      readResponse(xhr, file).then(resolve, reject);
    };
    xhr.onerror = () =>
      fail(new ApiError("network", "Couldn’t reach the image service. Check your connection and try again."));
    xhr.ontimeout = () =>
      fail(new ApiError("timeout", `That took longer than ${Math.round(timeoutMs / 1000)} seconds. Try again.`));
    xhr.onabort = () => fail(cancelled());
    signal?.addEventListener("abort", abortRequest, { once: true });

    onProgress?.({ phase: "uploading", percent: 0 });
    xhr.send(toFormData(file, params));
  });
}

/** The filename in a Content-Disposition header, or null. */
export function filenameFrom(header: string | null): string | null {
  if (!header) return null;
  let name: string | undefined;
  const encoded = /filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i.exec(header); // RFC 5987
  if (encoded) {
    try {
      name = decodeURIComponent(encoded[1].trim().replace(/^"|"$/g, ""));
    } catch {
      name = undefined;
    }
  }
  if (!name) {
    const plain = /filename\s*=\s*(?:"([^"]*)"|([^;]+))/i.exec(header);
    name = (plain?.[1] ?? plain?.[2])?.trim();
  }
  return name ? name.replace(/[/\\]/g, "_") : null;
}

function toFormData(file: File, params: Params): FormData {
  const form = new FormData();
  form.append("file", file, file.name);
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) continue;
    if (value instanceof Blob) form.append(key, value, value instanceof File ? value.name : key);
    else form.append(key, String(value));
  }
  return form;
}

async function readResponse(xhr: XMLHttpRequest, file: File): Promise<ApiResult> {
  const type = xhr.getResponseHeader("Content-Type") ?? "";
  const body = xhr.response as Blob | null;
  if (xhr.status < 200 || xhr.status >= 300) throw await errorFromResponse(xhr.status, type, body);
  if (!body || !type.startsWith("image/")) {
    throw new ApiError("bad_response", "The image service sent back something that isn’t an image.", xhr.status);
  }
  const filename = filenameFrom(xhr.getResponseHeader("Content-Disposition")) ?? fallbackName(file.name, type);
  return { blob: body, filename, type };
}

async function errorFromResponse(status: number, type: string, body: Blob | null): Promise<ApiError> {
  if (body && type.includes("json")) {
    try {
      const data = JSON.parse(await body.text()) as { code?: unknown; message?: unknown };
      if (typeof data.message === "string" && data.message) {
        const known = (SERVER_CODES as readonly unknown[]).includes(data.code);
        return new ApiError(known ? (data.code as ApiErrorCode) : "http_error", data.message, status);
      }
    } catch {
      // Not the API's JSON; fall through to a generic message.
    }
  }
  // A proxy in front of the API can refuse a big upload with its own page.
  if (status === 413) {
    return new ApiError("file_too_large", "That file is too large. Images must be 15 MB or smaller.", status);
  }
  return new ApiError("http_error", `The image service had a problem (error ${status}). Try again in a moment.`, status);
}

function fallbackName(original: string, type: string): string {
  const extension = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }[type.split(";")[0]] ?? "img";
  return `${original.replace(/\.[^.]+$/, "") || "image"}.${extension}`;
}

function cancelled(): ApiError {
  return new ApiError("aborted", "Cancelled.");
}
