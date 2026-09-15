# CLAUDE.md — Image Toolkit

## What this is
A browser-based image tool for small businesses and creators: drop an image,
pick an operation, download the result. v1 ships four operations — background
removal, resize/crop to presets, format conversion (with compression), and
watermarking. Processing happens on a Python API; nothing is stored. Mobile
usable (phone photos are a key input), desktop primary.

## Architecture
Monorepo, same pattern as invoice-generator:

```
web/    Next.js 15 + TypeScript + Tailwind + framer-motion   -> Vercel (Root Directory: web)
api/    FastAPI + Pillow + OpenCV + onnxruntime (Python 3.12) -> Railway (Root Directory: api)
```

- The API is stateless: each endpoint takes a multipart upload plus params and
  streams the processed image back. No disk writes beyond temp files, deleted
  after the response. Never log image bytes.
- Upload cap 15 MB; reject anything else with a clear error. Accept JPG, PNG,
  WEBP, HEIC (convert HEIC on the way in via pillow-heif).
- Every response sets `Content-Disposition: attachment; filename=...` with a
  sensible name (`photo-nobg.png`, `banner-1080x1080.jpg`).
- Ask before adding any model download to the Docker image (models download
  on first use; bake them into the image at build time so cold starts
  don't time out).

## API endpoints
```
POST /remove-bg        -> PNG with alpha   (onnxruntime, u2netp)
POST /resize           -> params: preset | width,height, fit=cover|contain, format
POST /convert          -> params: format (jpg|png|webp), quality (1-100)
POST /watermark        -> params: text OR logo file, position (9-grid), opacity, scale
GET  /health
```
- Presets for /resize: Instagram post 1080x1080, story 1080x1920, X header
  1500x500, LinkedIn banner 1584x396, WhatsApp DP 640x640, passport 35x45mm@300dpi.
- Strip EXIF on all outputs except when the user ticks "keep metadata".
- All image math lives in `api/ops/*.py`, one file per operation, pure
  functions `(PIL.Image, params) -> PIL.Image`, tested with pytest against
  small fixture images in `api/tests/fixtures/`.

## Web conventions
```
web/app/page.tsx                        landing + tool picker
web/app/[tool]/page.tsx                 one route per tool: remove-bg, resize, convert, watermark
web/app/modernist.css                   Modernist tokens + component classes (from the design project)
web/components/LandingDrop.tsx          landing drop zone (drag, tap, paste) + "Which tool?" dialog
web/components/workspace/Workspace.tsx  the workspace: tool tabs, files, runs, downloads
web/components/workspace/Stage.tsx      image stage: drop zone, progress, before/after slider, previews
web/lib/api.ts                          single fetch helper with progress + typed errors
web/lib/presets.ts                      the resize presets (mirror of the API list)
```
- Show the original instantly (object URL) before the API responds; swap in
  the result with a before/after slider.
- Show real progress: upload %, then "processing", then done. Time out at 60 s
  with a retry.
- Batch: allow up to 10 files for resize and convert; process sequentially and
  offer "Download all" as a ZIP built client-side (JSZip).
- Everything works at 375px; drop zone becomes a tap-to-choose that opens the
  camera/gallery picker.

## Working rules
- One task at a time from my list. Finish, build/test, commit, tell me.
- Commit messages: imperative, under 60 chars, prefixed `web:` / `api:`.
- Never install a package without saying why; flag anything that grows the
  Docker image past 1.5 GB.
- Design: the Modernist design system from the Claude Design project "Image
  Toolkit" (claude.ai/design/p/1e2c2f6d-69f3-4de9-b30d-5f666a562df7). Tokens
  and component classes live in `web/app/modernist.css`, copied from the
  project's `_ds/modernist-…/styles.css`, which stays the source of truth:
  retune there and copy across. Archivo only, one accent (#ec3013), zero
  radius, strong 2px dividers, labels flush left. Take colours, fonts and
  spacing from the tokens; never hard-code them.
- Keep copy true to the architecture: images are uploaded to the API, so
  never say they stay in the browser.
- Keep README current: local setup for both halves, env vars, Railway/Vercel
  steps, how to add a new operation.
- `.env.example` in both halves.

## Definition of done (v1)
- All four tools working end to end on the deployed URLs, including HEIC input
- Before/after slider, progress states, clear errors for bad files
- Batch resize/convert with ZIP download
- pytest and Vitest green; Lighthouse mobile perf and a11y >= 90 on the landing
- README done; a 20-second demo GIF in the README showing background removal
