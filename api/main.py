"""FastAPI app: upload an image plus params, get the processed image back.

Stateless: nothing is stored, and image bytes are never logged.
"""

import os
import re
from pathlib import PurePosixPath
from typing import Annotated, Literal
from urllib.parse import unquote

from fastapi import FastAPI, Form, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware

import codec
from errors import ApiError, install_error_handlers
from ops.convert import ConvertParams, OutputFormat, convert
from ops.resize import TRANSPARENT, Fit, ResizeParams, resize, target_size
from presets import PRESETS
from uploads import BodySizeLimit, read_upload

# Comma-separated list, e.g. "https://images.example.com,http://localhost:3000".
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get("ALLOWED_ORIGIN", "http://localhost:3000").split(",")
    if origin.strip()
]

app = FastAPI(title="Image Toolkit API", version="0.1.0")
install_error_handlers(app)
app.add_middleware(BodySizeLimit)
# Added last so it wraps everything: error responses carry CORS headers too.
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
    expose_headers=["Content-Disposition"],
)

PresetName = Literal[tuple(PRESETS)]  # type: ignore[valid-type]
Quality = Annotated[int, Form(ge=1, le=100)]
Side = Annotated[int | None, Form(ge=1, le=codec.MAX_SIDE)]
KeepMetadata = Annotated[bool, Form(description="Keep EXIF (camera, date, GPS). Stripped by default.")]

IMAGE_RESPONSES = {
    200: {
        "content": {media: {} for media in codec.MEDIA_TYPES.values()},
        "description": "The processed image, as an attachment.",
    }
}


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/convert", response_class=Response, responses=IMAGE_RESPONSES)
def convert_image(
    file: UploadFile,
    fmt: Annotated[OutputFormat, Form(alias="format")],
    quality: Quality = 85,
    keep_metadata: KeepMetadata = False,
) -> Response:
    src = read_upload(file)
    image = convert(src.image, ConvertParams(fmt))
    suffix = "-compressed" if fmt == src.format else ""
    return image_response(image, src, fmt, quality, keep_metadata, download_name(file.filename, suffix, fmt))


@app.post("/resize", response_class=Response, responses=IMAGE_RESPONSES)
def resize_image(
    file: UploadFile,
    preset: Annotated[PresetName | None, Form()] = None,
    width: Side = None,
    height: Side = None,
    fit: Annotated[Fit, Form()] = "cover",
    fmt: Annotated[OutputFormat | None, Form(alias="format", description="Default: same as the input (HEIC -> jpg)")] = None,
    quality: Quality = 90,
    background: Annotated[
        str | None,
        Form(pattern=r"^(#[0-9a-fA-F]{6}|transparent)$", description="Padding for fit=contain"),
    ] = None,
    keep_metadata: KeepMetadata = False,
) -> Response:
    dpi = None
    if preset and (width or height):
        raise ApiError(422, "invalid_params", "Send a preset or a width/height, not both.")
    if preset:
        width, height, dpi = PRESETS[preset].width, PRESETS[preset].height, PRESETS[preset].dpi
    elif not (width or height):
        raise ApiError(422, "invalid_params", "Send a preset, or a width and/or height.")

    src = read_upload(file)
    params = ResizeParams(width, height, fit, parse_background(background))
    out_w, out_h = target_size(src.image.size, params)
    if out_w * out_h > codec.MAX_PIXELS or max(out_w, out_h) > codec.MAX_SIDE:
        raise ApiError(
            422,
            "invalid_params",
            f"That output size is too large (max {codec.MAX_SIDE} px a side, "
            f"{codec.MAX_PIXELS // 1_000_000} megapixels).",
        )

    fmt = fmt or ("jpg" if src.format == "heic" else src.format)
    image = convert(resize(src.image, params), ConvertParams(fmt))
    name = download_name(file.filename, f"-{out_w}x{out_h}", fmt)
    return image_response(image, src, fmt, quality, keep_metadata, name, dpi=dpi)


def image_response(
    image,
    src: codec.Decoded,
    fmt: str,
    quality: int,
    keep_metadata: bool,
    filename: str,
    dpi: int | None = None,
) -> Response:
    body = codec.encode(
        image,
        fmt,
        quality=quality,
        exif=src.exif if keep_metadata else None,
        icc_profile=src.icc_profile,
        dpi=dpi,
    )
    return Response(
        body,
        media_type=codec.MEDIA_TYPES[fmt],
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def download_name(upload_name: str | None, suffix: str, fmt: str) -> str:
    """"My Photo (1).HEIC" + "-1080x1080" + "jpg" -> "My-Photo-1-1080x1080.jpg"."""
    # Browsers percent-encode quotes and newlines in multipart filenames.
    stem = PurePosixPath(unquote(upload_name or "").replace("\\", "/")).stem
    stem = re.sub(r"[^A-Za-z0-9_-]+", "-", stem).strip("-")[:80] or "image"
    return f"{stem}{suffix}.{fmt}"


def parse_background(value: str | None) -> tuple[int, int, int, int] | None:
    if value is None:
        return None
    if value == "transparent":
        return TRANSPARENT
    return (int(value[1:3], 16), int(value[3:5], 16), int(value[5:7], 16), 255)
