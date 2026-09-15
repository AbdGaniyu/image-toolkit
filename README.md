# Image Toolkit

Drop an image, pick an operation, download the result: background removal,
resize/crop to presets, format conversion with compression, and watermarking.
Processing happens on a stateless Python API; nothing is stored. See
`CLAUDE.md` for the full spec.

## Layout

```
web/    Next.js 15 + TypeScript + Tailwind             -> Vercel
api/    FastAPI + Pillow + pillow-heif + onnxruntime   -> Railway
```

## API (`api/`)

Every processing endpoint takes a `multipart/form-data` upload (field `file`)
plus form params, and returns the image as an attachment with a sensible
`Content-Disposition` filename.

| Endpoint | Params | Returns |
| --- | --- | --- |
| `GET /health` | | `{"status": "ok"}` |
| `POST /remove-bg` | `keep_metadata` | `photo-nobg.png`: always PNG, background transparent (u2netp) |
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
| `MODEL_DIR` | `~/.cache/image-toolkit` | Folder holding the background-removal model; the Docker image sets `/models` |

See `api/.env.example`.

### Background removal model

`/remove-bg` runs the **u2netp** model (4.7 MB, the light version of u2net,
from the rembg project, chosen to fit Railway's free-tier memory) on the CPU
with onnxruntime directly. It predicts a soft mask, which becomes the PNG's
alpha channel. The pre- and post-processing match rembg's, but rembg itself
isn't a dependency: importing it loaded scipy, numba and pymatting, about
540 MB of memory before the first request.

- **One session per process**, created when `ops/remove_bg.py` is imported and
  shared by every request. The server runs a single uvicorn worker, so there
  is one copy of the model in memory.
- **One at a time:** a lock in `main.py` lets only one `/remove-bg` run per
  process; others wait their turn (each run holds several full-resolution
  copies of the image). The other endpoints aren't limited.
- **Any size of input:** the model always sees a 320x320 copy. Its mask is
  scaled up to the full image and applied to the original, so the output
  keeps every original pixel.
- **Docker:** the model is downloaded at build time into `/models`, checked
  against the SHA-256 pinned in the Dockerfile, so a container never fetches it.
- **Locally:** the first import of `ops/remove_bg.py` (starting the API, or
  pytest) downloads it to `~/.cache/image-toolkit/` (or `$MODEL_DIR`) and
  checks its SHA-256, so the first run needs a network connection.
- **Changing the model:** update `MODEL_URL` and `MODEL_SHA256` in
  `ops/remove_bg.py` and the `ADD --checksum` line in `api/Dockerfile` together.
- **Tests** swap the onnxruntime session for a fake that marks the left half as
  foreground; `tests/test_ops_remove_bg.py` also runs the real model once.

**Memory** (container peak, linux/amd64 emulated on an M-series Mac): the app
idles at ~150 MB; one `/remove-bg` peaks at ~410 MB for a small photo and
~600 MB for a 12 MP one. Railway's trial plan allows 1 GB. With rembg it was
~990 MB and ~1.2 GB, and 12 MP uploads crashed the service.

### Deploy (Railway)

1. New project -> Deploy from GitHub repo, set **Root Directory** to `api`.
   Railway picks up `api/Dockerfile`.
2. Set `ALLOWED_ORIGIN` to the Vercel URL of the web app.
3. Generate a domain; health check path `/health`.

Local image: `docker build -t image-api api && docker run -p 8000:8000 image-api`.

**Image size** (linux/amd64): about **332 MB unpacked, ~115 MB compressed**
(what Railway pulls). The Debian base is 93 MB, numpy 70 MB, onnxruntime
67 MB, Pillow and pillow-heif 47 MB, the rest of Python ~55 MB; the model is
under 5 MB. Docker Desktop's "disk usage" column shows ~485 MB because it
counts the compressed layers and the unpacked copy. Keep the unpacked size
under 1.5 GB (`docker run --rm --entrypoint du image-api -sxh /`).

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

Next.js 15 (App Router) + TypeScript + Tailwind 4. The UI follows the **Image
Toolkit** design (Claude Design) on its **Modernist** design system: Archivo
throughout, one red accent, square corners, strong 2px rules.

| File | Role |
| --- | --- |
| `app/modernist.css` | Modernist tokens and component classes (`.btn`, `.seg`, `.input`, `.nav`, `.dialog`), copied from the design project's `_ds/modernist-…/styles.css`, which stays the source of truth |
| `app/toolkit.css` | The design's own pieces: checkerboard, labels, tool-card animations, the processing shimmer, the phone bottom sheet |
| `app/layout.tsx` | Archivo via `next/font` (its variable sits on `<html>` so the tokens resolve), metadata |
| `app/page.tsx` | Landing: headline, the four tool cards, the drop zone |
| `app/[tool]/page.tsx` | One static route per tool (anything else is a 404), rendering the workspace |
| `components/SiteHeader.tsx` | Brand bar with the Landing / Workspace switch |
| `components/ToolCards.tsx` | The four cards; each illustration loops only on hover or keyboard focus |
| `components/LandingDrop.tsx` | Landing drop zone (drop, click, paste, sample photo) and the "Which tool?" dialog |
| `components/workspace/Workspace.tsx` | The workspace: tool tabs, files, runs and downloads; images stay loaded across tools |
| `components/workspace/Stage.tsx` | The image stage: drop zone, upload ring, shimmer, before/after handle with its intro sweep, resize frame, watermark preview |
| `components/workspace/panels.tsx` | The four tools' control panels |
| `components/workspace/BatchBar.tsx` | Resize/convert queue with per-file status and the ZIP download |
| `components/InlineError.tsx` | Plain-language error under the stage |
| `lib/tools.ts` | The four tools: route, name, blurb, button label, and ZIP name for the batch tools |
| `lib/batch.ts` | Runs a batch one image at a time; unique names; builds the ZIP |
| `lib/params.ts` | Each tool's settings as API form fields, with plain-word validation |
| `lib/presets.ts` | Resize presets, mirroring `api/presets.py` (a test checks they agree) |
| `lib/presetChips.ts` | The design's size chips by platform; API presets are sent as presets, the rest as width and height |
| `lib/canvas.ts` | Browser-side previews: convert's size estimate, colour behind a cut-out, the watermark preview |
| `lib/pending.ts`, `lib/sample.ts` | Hand-off of files dropped on the landing page; the sample photo (`public/sample.jpg`) |
| `lib/files.ts` | Checks files before uploading, with the API's limits (JPG/PNG/WEBP/HEIC, 15 MB, batches of 10) |
| `lib/api.ts` | `processImage()`, the single helper for calling the API |
| `lib/useObjectUrl.ts`, `lib/download.ts` | Object URLs for instant previews; saving a result |

### Tool pages

`/remove-bg`, `/resize`, `/convert` and `/watermark` are one workspace with
four panels; switching tools keeps the images and clears the results.

1. Drop, click, paste, or use the sample photo; it shows on the stage at once.
   Dropping on the landing page asks "Which tool?" first.
2. Set the panel and press its button. Resize draws the target frame on the
   image, watermark previews the mark, and convert shows the browser's
   estimate of the output size (the API's encoder differs a little).
3. The stage shows an upload ring with the real percentage, then a shimmer
   over the image while the API works, with Cancel. After 60 s it gives up.
4. The result sweeps in behind the handle (result left, original right) and
   settles at 55%; drag it or use the arrow keys (Shift for 10%). Remove
   background can then put white, black or any colour behind the cut-out.
   Download is in the top bar and under **Result**.

Errors appear under the stage in plain words, with **Try again** when it can
help (network, timeout, server errors).

**Batch** (resize and convert): up to 10 images in a queue under the stage,
each with its status. They go to the API one at a time with the same
settings, and a failure doesn't stop the rest; Cancel skips what's left.
**Download all (.zip)** builds a ZIP in the browser with
[JSZip](https://stuk.github.io/jszip/) (loaded only when you click it),
making repeated names unique (`photo.jpg`, `photo (2).jpg`).

**Where this differs from the design file.** Copy saying images never leave
the tab ("Runs in your tab", "Every pixel stays on this machine") is replaced
with true lines, because processing happens on the API. Resize adds WhatsApp
DP and Passport chips (API presets the spec needs). The design's "375px &
states" and "Hand-off" tabs are documentation, so they aren't screens here;
the phone layout is the real responsive behaviour (tool cards 2×2, controls
in a bottom sheet with the main action pinned).

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

Only Safari can show HEIC in an `<img>`, so other browsers show "No preview of
this format in your browser" for a HEIC original; the result (JPG, PNG or WEBP)
shows as normal.

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
npm run e2e          # browser check against the real API (after npm run build)
```

### End-to-end check

`npm run e2e` (`web/scripts/e2e.mjs`) drives headless Chrome through the
DevTools protocol against the built web app and the local API, with real
uploads: progress under a throttled upload, the slider (drag and arrow keys),
each tool's result and filename, HEIC, a damaged file, offline then Try again,
a wrong file type, batch mode (one at a time, failures, Cancel, the 10-image
limit, and the downloaded ZIP unpacked and checked), a 375 px phone view, and
no console errors.

It starts the API on :8000 and `next start` on :3100 itself and stops them
afterwards, and refuses to run if either port is taken. It needs Node 22+,
Chrome or Chromium (or `CHROME=/path/to/chrome`), the API's `.venv`, and a web
build pointing at `http://localhost:8000` (the default). The first run
downloads the u2netp model (4.7 MB) before the checks start. Screenshots go
to `E2E_OUT`, or a temp folder it prints at the end.

### Environment

| Var | Default | Meaning |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` (dev only) | Base URL of the image API |

See `web/.env.example`. It's read at build time (baked into the browser
bundle), so set it before building, including on Vercel. A production build
(`next build`) throws unless it starts with `https://`; the localhost default
applies only to `npm run dev` and tests.

### Running both halves

```sh
# terminal 1: the API, allowing the dev web origin
cd api && ALLOWED_ORIGIN=http://localhost:3000 .venv/bin/uvicorn main:app --reload --port 8000
# terminal 2: the web app
cd web && npm run dev    # http://localhost:3000
```

### Deploy (Vercel)

1. Import the GitHub repo, set **Root Directory** to `web` (framework: Next.js).
2. Set `NEXT_PUBLIC_API_URL` to the Railway API URL (`https://…`; the build
   fails otherwise).
3. Put the resulting Vercel URL in the API's `ALLOWED_ORIGIN`.
