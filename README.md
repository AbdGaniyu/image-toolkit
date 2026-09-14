# Image Toolkit

Drop an image, pick an operation, download the result: background removal,
resize/crop to presets, format conversion with compression, and watermarking.
Processing happens on a stateless Python API; nothing is stored. See
`CLAUDE.md` for the full spec.

## Layout

```
web/    Next.js 15 + TypeScript + Tailwind       -> Vercel   (not built yet)
api/    FastAPI + Pillow + pillow-heif           -> Railway
```

## API (`api/`)

Every processing endpoint takes a `multipart/form-data` upload (field `file`)
plus form params, and returns the image as an attachment with a sensible
`Content-Disposition` filename.

| Endpoint | Params | Returns |
| --- | --- | --- |
| `GET /health` | | `{"status": "ok"}` |
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

See `api/.env.example`.

### Deploy (Railway)

1. New project -> Deploy from GitHub repo, set **Root Directory** to `api`.
   Railway picks up `api/Dockerfile`.
2. Set `ALLOWED_ORIGIN` to the Vercel URL of the web app.
3. Generate a domain; health check path `/health`.

Local image: `docker build -t image-api api && docker run -p 8000:8000 image-api`.

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
