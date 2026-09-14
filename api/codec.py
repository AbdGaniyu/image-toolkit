"""Bytes in, bytes out: decode uploads into working images, encode results.

Decoding validates the format, applies EXIF orientation and normalises to RGB
or RGBA, so ops/ never sees anything else. Metadata is lifted off the image
into `Decoded` and only written back when the caller passes it to `encode`.
"""

import io
from dataclasses import dataclass

import pillow_heif
from PIL import Image, ImageOps

from errors import ApiError

pillow_heif.register_heif_opener()

# Covers 50 MP phone cameras; one RGBA copy of the largest image is ~240 MB.
MAX_PIXELS = 60_000_000
MAX_SIDE = 10_000
Image.MAX_IMAGE_PIXELS = MAX_PIXELS  # Pillow's own bomb check, as a backstop

# Pillow's format name -> ours. Pillow reports many phone JPEGs as MPO.
INPUT_FORMATS = {"JPEG": "jpg", "MPO": "jpg", "PNG": "png", "WEBP": "webp", "HEIF": "heic"}
PIL_FORMATS = {"jpg": "JPEG", "png": "PNG", "webp": "WEBP"}
MEDIA_TYPES = {"jpg": "image/jpeg", "png": "image/png", "webp": "image/webp"}

_UNSUPPORTED = "That file type isn't supported. Use a JPG, PNG, WEBP or HEIC image."
_UNREADABLE = "That image couldn't be read. The file may be damaged or incomplete."
_16_BIT_MODES = {"I", "I;16", "I;16B", "I;16L", "I;16N"}


@dataclass(frozen=True)
class Decoded:
    image: Image.Image  # RGB or RGBA, upright, empty .info
    format: str  # jpg | png | webp | heic
    exif: bytes | None  # orientation removed; only written with "keep metadata"
    icc_profile: bytes | None  # colour profile; always kept so colours don't shift


def decode(data: bytes) -> Decoded:
    try:
        image = Image.open(io.BytesIO(data))
    except Image.DecompressionBombError:
        raise _too_many_pixels() from None
    except (OSError, SyntaxError, ValueError):
        raise ApiError(415, "unsupported_type", _UNSUPPORTED) from None

    fmt = INPUT_FORMATS.get(image.format or "")
    if fmt is None:
        raise ApiError(415, "unsupported_type", _UNSUPPORTED)
    if image.width * image.height > MAX_PIXELS:
        raise _too_many_pixels()

    try:
        image = ImageOps.exif_transpose(image)  # also decodes the pixels
    except (OSError, SyntaxError, ValueError):
        raise ApiError(400, "invalid_image", _UNREADABLE) from None

    exif = _exif_bytes(image)
    icc_profile = image.info.get("icc_profile") if image.mode != "CMYK" else None
    image = _to_working_mode(image)
    image.info = {}
    return Decoded(image, fmt, exif, icc_profile)


def encode(
    image: Image.Image,
    fmt: str,
    *,
    quality: int,
    exif: bytes | None = None,
    icc_profile: bytes | None = None,
    dpi: int | None = None,
) -> bytes:
    options: dict = {}
    if fmt == "jpg":
        options = {"quality": quality, "optimize": True, "progressive": True}
    elif fmt == "webp":
        options = {"quality": quality}
    # PNG is lossless, so quality doesn't apply.
    if exif:
        options["exif"] = exif
    if icc_profile:
        options["icc_profile"] = icc_profile
    if dpi:
        options["dpi"] = (dpi, dpi)
    buffer = io.BytesIO()
    image.save(buffer, PIL_FORMATS[fmt], **options)
    return buffer.getvalue()


def _to_working_mode(image: Image.Image) -> Image.Image:
    if image.mode in ("RGB", "RGBA"):
        return image
    if image.mode in _16_BIT_MODES:
        # A plain convert clips everything above 255 to white; scale instead.
        image = image.convert("I").point(lambda v: v * (1 / 256)).convert("L")
    has_alpha = "A" in image.mode or "transparency" in image.info
    return image.convert("RGBA" if has_alpha else "RGB")


def _exif_bytes(image: Image.Image) -> bytes | None:
    try:
        exif = image.getexif()
        return exif.tobytes() if len(exif) else None
    except Exception:  # malformed EXIF: drop it rather than fail the upload
        return None


def _too_many_pixels() -> ApiError:
    return ApiError(
        413,
        "image_too_large",
        f"That image is too large to process (over {MAX_PIXELS // 1_000_000} megapixels).",
    )
