"""Prepare pixels for an output format. Encoding (quality, metadata) is codec.encode."""

from dataclasses import dataclass
from typing import Literal

from PIL import Image

OutputFormat = Literal["jpg", "png", "webp"]


@dataclass(frozen=True)
class ConvertParams:
    format: OutputFormat
    # JPEG has no alpha: transparent pixels are laid over this colour.
    background: tuple[int, int, int] = (255, 255, 255)


def convert(image: Image.Image, params: ConvertParams) -> Image.Image:
    if image.mode != "RGBA":
        return image
    if image.getextrema()[3][0] == 255:
        return image.convert("RGB")  # alpha channel present but unused
    if params.format != "jpg":
        return image
    flat = Image.new("RGB", image.size, params.background)
    flat.paste(image, mask=image.getchannel("A"))
    return flat
