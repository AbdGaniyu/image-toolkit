# Image Toolkit

Drop an image, pick an operation, download the result: background removal,
resize/crop to presets, format conversion with compression, and watermarking.
Processing happens on a stateless Python API; nothing is stored. See
`CLAUDE.md` for the full spec.

## Layout

```
web/    Next.js 15 + TypeScript + Tailwind       -> Vercel
api/    FastAPI + Pillow + pillow-heif + rembg   -> Railway
```

## API (`api/`)

Every processing endpoint takes a `multipart/form-data` upload (field `file`)
plus form params, and returns the image as an attachment with a sensible
`Content-Disposition` filename.

| Endpoint | Params | Returns |
| --- | --- | --- |
| `GET /health` | | `{"status": "ok"}` |
| `POST /remove-bg` | `keep_metadata` | `photo-nobg.png`: always PNG, background transparent (u2net) |
| `POST /convert` | `format` (`jpg`\|`png`\|`webp`, required), `quality` (1-100, default 85; ignored for PNG), `keep_metadata` | `photo.webp`, or `photo-compressed.jpg` when the format is unchanged |
| `POST /resize` | `preset`, **or** `width` and/or `height` (1-10000); `fit` (`cover` crops, `contain` pads; default `cover`); `background` (`#rrggbb` or `transparent`, padding for `contain`; default transparent for images with alpha, else white); `format` (default: same as input, HEIC -> jpg); `quality` (default 90); `keep_metadata` | `banner-1080x1080.jpg` |

| `POST /watermark` | `text` (up to 100 characters, one line) **or** `logo` (a second image file, transparency respected); `position` (`top-left`, `top`, `top-right`, `left`, `center`, `right`, `bottom-left`, `bottom`, `bottom-right`; default `bottom-right`); `opacity` (0-1, default 0.5); `scale` (watermark width as a fraction of the image width, 0.05-1, default 0.25); `color` (text colour `#rrggbb`, default white); `format`, `quality`, `keep_metadata` as for `/resize` | `photo-watermarked.jpg` |

With only `width` or only `height`, the other side keeps the aspect ratio.

**Watermarks** sit 3% of the shorter side in from the edges and shrink if they
wouldn't fit. Text is Inter Medium (`api/fonts/`, SIL Open Font License,
`fonts/LICENSE.txt`) with a thin outline in a contrasting colour so it reads
on any background. Inter covers Latin, Greek and Cyrillic (plus symbols like
© and ₦); other scripts would draw as boxes.

**Resize presets** (`api/presets.py`; `web/lib/presets.ts` will mirror it):

| `preset` | Size |
| --- | --- |
| `instagram-post` | 1080x1080 |
| `instagram-story` | 1080x1920 |
| `x-header` | 1500x500 |
| `linkedin-banner` | 1584x396 |
| `whatsapp-dp` | 640x640 |
| `passport` | 413x531 (35x45 mm at 300 dpi; the file records 300 dpi) |

**Inputs.** JPG, PNG, WEBP and HEIC, up to 15 MB and 60 megapixels. Phone
photos are turned upright from their EXIF orientation. Palette, greyscale,
16-bit and CMYK images are normalised to RGB/RGBA on the way in.

**Metadata.** EXIF (camera, date, GPS) is stripped from every output unless
`keep_metadata=true`. The ICC colour profile is always kept so colours don't
shift; it carries no personal data.

**Errors** are JSON with a stable `code` and a message fit to show users:
`{"code": "file_too_large", "message": "That file is over 15 MB. ..."}`.

| Status | `code` | When |
| --- | --- | --- |
| 400 | `empty_file`, `invalid_image` | Empty upload; damaged or truncated image |
| 413 | `file_too_large` | File over 15 MB (or request body over 31 MB) |
| 413 | `image_too_large` | Over 60 megapixels |
| 415 | `unsupported_type` | Not JPG/PNG/WEBP/HEIC |
| 422 | `missing_file`, `invalid_params` | No `file` field; bad or conflicting params |

For a bad `/watermark` logo the message starts with `Logo: `.

| File | Role |
| --- | --- |
| `main.py` | App, CORS, routes, download filenames |
| `codec.py` | Decode uploads (format check, HEIC, orientation, normalise) and encode results (quality, metadata, dpi) |
| `ops/*.py` | One file per operation: pure `(PIL.Image, params) -> PIL.Image`, never touch metadata |
| `presets.py` | Resize presets |
| `fonts/` | Inter Medium for text watermarks (SIL Open Font License) |
| `uploads.py` | 15 MB file cap, request body cap middleware |
| `errors.py` | `ApiError` and the JSON error shape |
| `tests/fixtures/` | Tiny synthetic images, one per decode path; `make_fixtures.py` regenerates them |

### Local setup

Python 3.12 (what the Docker image runs).

```sh
cd api
python3.12 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/pytest                      # ops, codec, endpoints
.venv/bin/uvicorn main:app --reload   # http://localhost:8000/docs
```

Try it:

```sh
curl -F file=@photo.heic -F preset=instagram-post localhost:8000/resize -OJ
curl -F file=@photo.png -F format=webp -F quality=80 localhost:8000/convert -OJ
```

### Environment

| Var | Default | Meaning |
| --- | --- | --- |
| `ALLOWED_ORIGIN` | `http://localhost:3000` | Comma-separated origins allowed by CORS (the web app's URL) |
| `PORT` | `8000` | Port the container listens on (set by Railway) |
| `U2NET_HOME` | `~/.rembg` | Where rembg keeps models; the Docker image sets `/models` |

See `api/.env.example`.

### Background removal model

`/remove-bg` runs rembg's **u2net** model (176 MB) on the CPU through
onnxruntime. It predicts a soft mask (smooth edges on hair and fur), which
becomes the PNG's alpha channel.

- **Docker:** the model is downloaded and checksum-verified at build time into
  `/models`, so a container never fetches it and cold starts stay fast.
- **Locally:** rembg downloads it on the first `/remove-bg` call, to
  `~/.rembg/models/u2net/` (or `$U2NET_HOME/models/u2net/`). To fetch it up
  front: `.venv/bin/python -c "from rembg import new_session; new_session('u2net')"`.
- **Tests** use a fake model, so they don't need the download.
  `tests/test_ops_remove_bg.py` also runs the real model once it's on disk and
  skips that test otherwise.

### Deploy (Railway)

1. New project -> Deploy from GitHub repo, set **Root Directory** to `api`.
   Railway picks up `api/Dockerfile`.
2. Set `ALLOWED_ORIGIN` to the Vercel URL of the web app.
3. Generate a domain; health check path `/health`.

Local image: `docker build -t image-api api && docker run -p 8000:8000 image-api`.

**Image size** (linux/amd64, rembg 2.0.84): about **906 MB unpacked, 416 MB
compressed** (what Railway pulls). The u2net model is 168 MB of that; most of
the rest is rembg's scientific stack (llvmlite 173 MB, scipy 139 MB, numpy
70 MB, onnxruntime 67 MB). Docker Desktop's "disk usage" column shows ~1.4 GB
because it counts the compressed layers and the unpacked copy. Keep the
unpacked size under 1.5 GB (`docker run --rm --entrypoint du image-api -sxh /`).
On a slow connection the first build takes a while: pip is ~700 MB of wheels
and the model download is 176 MB.

### Adding a new operation

1. `api/ops/<name>.py`: a params dataclass and a pure function
   `(PIL.Image, params) -> PIL.Image`. Inputs are always RGB or RGBA and
   upright; leave metadata to `codec`.
2. `api/tests/test_ops_<name>.py`: test it on small images (add a fixture to
   `make_fixtures.py` if it needs one).
3. A route in `main.py`: `read_upload(file)` -> your op -> `convert(...)` for
   the output format -> `image_response(...)` with a download name suffix
   (`-nobg`, `-1080x1080`, ...). Raise `ApiError` for bad params.
4. Endpoint tests in `tests/test_api.py`, and a row in the endpoint table above.
5. Web: add the endpoint to `Endpoint` in `lib/api.ts` and an entry to
   `lib/tools.ts`, a params builder (with tests) in `lib/params.ts`, and a
   `components/tools/<Name>Tool.tsx` registered in `app/[tool]/page.tsx`.

## Web (`web/`)

Next.js 15 (App Router) + TypeScript + Tailwind 4, styled with the portfolio
style guide's tokens. Tool pages use placeholder styling for now.

| File | Role |
| --- | --- |
| `app/globals.css` | Design tokens from the portfolio style guide ("Portfolio System"), copied from the portfolio's `app/globals.css`; change them there first and copy across |
| `app/layout.tsx` | Fonts (Bricolage Grotesque, Figtree, JetBrains Mono via `next/font`; their variables sit on `<html>` so the tokens resolve), metadata |
| `app/page.tsx` | Landing: the four tools |
| `app/[tool]/page.tsx` | One static route per tool; anything else is a 404 |
| `components/ToolWorkspace.tsx` | The shared flow on every tool page (below) |
| `components/BatchList.tsx` | Batch mode: each image's status, per-image and ZIP downloads |
| `components/tools/*Tool.tsx` | Each tool's settings form |
| `components/BeforeAfter.tsx` | Original vs result, split by a divide you drag or move with the arrow keys; checkerboard behind transparent results |
| `components/Dropzone.tsx` | Shared upload: drag and drop, click or tap to choose (camera or photo library on phones), or paste from the clipboard anywhere on the page |
| `components/fields.tsx` | Form building blocks and button styles |
| `lib/tools.ts` | The four tools: route, name, blurb, button label, and ZIP name for the batch tools |
| `lib/batch.ts` | Runs a batch one image at a time; unique names; builds the ZIP |
| `lib/params.ts` | Each tool's settings as API form fields, with plain-word validation |
| `lib/presets.ts` | Resize presets, mirroring `api/presets.py` (a test checks they agree) |
| `lib/files.ts` | Checks files before uploading, with the API's limits (JPG/PNG/WEBP/HEIC, 15 MB, batches of 10) |
| `lib/api.ts` | `processImage()`, the single helper for calling the API |
| `lib/useObjectUrl.ts`, `lib/download.ts` | Object URLs for instant previews; saving a result |

### Tool pages

`/remove-bg`, `/resize`, `/convert` and `/watermark` share one flow:

1. Choose an image (drop, tap or paste). It shows straight away from an object URL.
2. Adjust the settings and press the tool's button. Background removal starts
   by itself.
3. "Uploading… n%", then "Processing…", with Cancel. After 60 s it gives up.
4. The result appears in the before/after slider with its pixel size, the
   file size change and **Download**. Change a setting and press
   **Apply changes** to run it again.

Errors show the API's message. **Try again** appears when it can help
(network, timeout, server errors); a bad file offers **Choose another image**.

**Batch** (resize and convert): choose 2 to 10 images and they're listed with
their status. They go to the API one at a time with the same settings, and a
failure doesn't stop the rest. **Cancel** skips what's left; **Try failed
again** reruns the ones that failed for a reason worth retrying. Each result
has its own Download, and **Download all (ZIP)** builds a ZIP in the browser
with [JSZip](https://stuk.github.io/jszip/) (loaded only when you click it),
making repeated names unique (`photo.jpg`, `photo (2).jpg`).

### Calling the API

```ts
import { ApiError, processImage } from "@/lib/api";

const result = await processImage("resize", file, { preset: "instagram-post" }, {
  onProgress: (p) => setStatus(p.phase === "uploading" ? `Uploading ${p.percent}%` : "Processing…"),
  signal: controller.signal, // optional: cancel
});
// result.blob, result.filename ("photo-1080x1080.jpg"), result.type
```

It uses XMLHttpRequest because `fetch` can't report upload progress, and times
out after 60 s (upload plus processing). Failures reject with an `ApiError`:
`code` is the API's error code (see "Errors" above) or `network`, `timeout`,
`aborted`, `bad_response`; `message` is ready to show; `retryable` says whether
a "Try again" button makes sense (network, timeout, 5xx).

Only Safari can show HEIC in an `<img>`, so other browsers show "No preview in
this browser" for a HEIC original; the result (JPG, PNG or WEBP) shows as normal.

### Local setup

Node 22+ (tested on 24).

```sh
cd web
npm install
cp .env.example .env.local
npm run dev          # http://localhost:3000
npm test             # Vitest: file checks, API client, params, presets vs the API, batch + ZIP
npm run typecheck
npm run lint
npm run build
```

### Environment

| Var | Default | Meaning |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Base URL of the image API |

See `web/.env.example`. It's read at build time (baked into the browser
bundle), so set it before building, including on Vercel.

### Running both halves

```sh
# terminal 1: the API, allowing the dev web origin
cd api && ALLOWED_ORIGIN=http://localhost:3000 .venv/bin/uvicorn main:app --reload --port 8000
# terminal 2: the web app
cd web && npm run dev    # http://localhost:3000
```

### Deploy (Vercel)

1. Import the GitHub repo, set **Root Directory** to `web` (framework: Next.js).
2. Set `NEXT_PUBLIC_API_URL` to the Railway API URL.
3. Put the resulting Vercel URL in the API's `ALLOWED_ORIGIN`.
