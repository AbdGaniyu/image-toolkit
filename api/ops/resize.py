"""Resize to an exact box (cover crops, contain pads) or scale by one side."""

from dataclasses import dataclass
from typing import Literal

from PIL import Image, ImageOps

Fit = Literal["cover", "contain"]
RGBA = tuple[int, int, int, int]

TRANSPARENT: RGBA = (0, 0, 0, 0)
WHITE: RGBA = (255, 255, 255, 255)


@dataclass(frozen=True)
class ResizeParams:
    width: int | None = None
    height: int | None = None
    fit: Fit = "cover"
    # Padding for fit="contain". None: transparent if the image has alpha, else white.
    background: RGBA | None = None


def target_size(size: tuple[int, int], params: ResizeParams) -> tuple[int, int]:
    """Output size. With one side given, the other keeps the aspect ratio."""
    width, height = params.width, params.height
    if width is None and height is None:
        raise ValueError("width or height is required")
    src_w, src_h = size
    if width is None:
        width = max(1, round(src_w * height / src_h))
    if height is None:
        height = max(1, round(src_h * width / src_w))
    return width, height


def resize(image: Image.Image, params: ResizeParams) -> Image.Image:
    size = target_size(image.size, params)
    if params.width is None or params.height is None:
        return image.resize(size, Image.Resampling.LANCZOS)
    if params.fit == "cover":
        return ImageOps.fit(image, size, Image.Resampling.LANCZOS)

    inner = ImageOps.contain(image, size, Image.Resampling.LANCZOS).convert("RGBA")
    background = params.background or (TRANSPARENT if image.mode == "RGBA" else WHITE)
    canvas = Image.new("RGBA", size, background)
    canvas.alpha_composite(inner, ((size[0] - inner.width) // 2, (size[1] - inner.height) // 2))
    # An opaque background leaves nothing transparent, so drop the alpha channel.
    return canvas.convert("RGB") if background[3] == 255 else canvas
