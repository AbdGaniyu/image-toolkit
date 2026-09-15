"""FastAPI app: upload an image plus params, get the processed image back.

Stateless: nothing is stored, and image bytes are never logged.
"""

import os
import re
import threading
from pathlib import PurePosixPath
from typing import Annotated, Literal
from urllib.parse import unquote

from fastapi import FastAPI, File, Form, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware

import codec
from errors import ApiError, install_error_handlers
from ops.convert import ConvertParams, OutputFormat, convert
from ops.remove_bg import remove_bg
from ops.resize import TRANSPARENT, Fit, ResizeParams, resize, target_size
from ops.watermark import Position, WatermarkParams, watermark
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

HEX_COLOUR = r"^#[0-9a-fA-F]{6}$"

PresetName = Literal[tuple(PRESETS)]  # type: ignore[valid-type]
Quality = Annotated[int, Form(ge=1, le=100)]
Side = Annotated[int | None, Form(ge=1, le=codec.MAX_SIDE)]
KeepMetadata = Annotated[bool, Form(description="Keep EXIF (camera, date, GPS). Stripped by default.")]
FormatOrSame = Annotated[
    OutputFormat | None,
    Form(alias="format", description="Default: same as the input (HEIC -> jpg)"),
]

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
    fmt: FormatOrSame = None,
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

    fmt = fmt or same_format(src)
    image = convert(resize(src.image, params), ConvertParams(fmt))
    name = download_name(file.filename, f"-{out_w}x{out_h}", fmt)
    return image_response(image, src, fmt, quality, keep_metadata, name, dpi=dpi)


@app.post("/watermark", response_class=Response, responses=IMAGE_RESPONSES)
def watermark_image(
    file: UploadFile,
    text: Annotated[str | None, Form(max_length=100, description="One line; send this or logo")] = None,
    logo: Annotated[UploadFile | None, File(description="An image; transparency is respected")] = None,
    position: Annotated[Position, Form()] = "bottom-right",
    opacity: Annotated[float, Form(gt=0, le=1)] = 0.5,
    scale: Annotated[float, Form(ge=0.05, le=1, description="Watermark width / image width")] = 0.25,
    color: Annotated[str, Form(pattern=HEX_COLOUR, description="Text colour")] = "#ffffff",
    fmt: FormatOrSame = None,
    quality: Quality = 90,
    keep_metadata: KeepMetadata = False,
) -> Response:
    text = " ".join((text or "").split()) or None
    if text is None and logo is None:
        raise ApiError(422, "invalid_params", "Send watermark text or a logo.")
    if text is not None and logo is not None:
        raise ApiError(422, "invalid_params", "Send watermark text or a logo, not both.")

    src = read_upload(file)
    logo_image = None
    if logo is not None:
        try:
            logo_image = read_upload(logo).image
        except ApiError as err:
            raise ApiError(err.status_code, err.code, f"Logo: {err.detail}") from None

    fmt = fmt or same_format(src)
    params = WatermarkParams(text, logo_image, position, opacity, scale, parse_hex(color))
    image = convert(watermark(src.image, params), ConvertParams(fmt))
    name = download_name(file.filename, "-watermarked", fmt)
    return image_response(image, src, fmt, quality, keep_metadata, name)


@app.post(
    "/remove-bg",
    response_class=Response,
    responses={200: {"content": {"image/png": {}}, "description": "PNG with the background transparent."}},
)
def remove_background(file: UploadFile, keep_metadata: KeepMetadata = False) -> Response:
    # Taken before decoding, so a queued request holds only its spooled upload.
    with _remove_bg_lock:
        src = read_upload(file)
        image = remove_bg(src.image)
        name = download_name(file.filename, "-nobg", "png")
        return image_response(image, src, "png", 100, keep_metadata, name)  # PNG ignores quality


# One /remove-bg at a time per process: a run holds several full-resolution
# copies of the image, and the server's memory has room for one. FastAPI runs
# sync endpoints on a thread pool, so without this they'd overlap. The other
# endpoints aren't limited.
_remove_bg_lock = threading.Lock()


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


def same_format(src: codec.Decoded) -> str:
    """The input's own format; HEIC can't be written, so it becomes jpg."""
    return "jpg" if src.format == "heic" else src.format


def download_name(upload_name: str | None, suffix: str, fmt: str) -> str:
    """"My Photo (1).HEIC" + "-1080x1080" + "jpg" -> "My-Photo-1-1080x1080.jpg"."""
    # Browsers percent-encode quotes and newlines in multipart filenames.
    stem = PurePosixPath(unquote(upload_name or "").replace("\\", "/")).stem
    stem = re.sub(r"[^A-Za-z0-9_-]+", "-", stem).strip("-")[:80] or "image"
    return f"{stem}{suffix}.{fmt}"


def parse_hex(value: str) -> tuple[int, int, int]:
    return (int(value[1:3], 16), int(value[3:5], 16), int(value[5:7], 16))


def parse_background(value: str | None) -> tuple[int, int, int, int] | None:
    if value is None:
        return None
    if value == "transparent":
        return TRANSPARENT
    return (*parse_hex(value), 255)
