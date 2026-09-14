"""Stamp text or a logo onto an image at one of nine positions."""

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Literal

from PIL import Image, ImageDraw, ImageFont

Position = Literal[
    "top-left", "top", "top-right",
    "left", "center", "right",
    "bottom-left", "bottom", "bottom-right",
]  # fmt: skip

# Where the watermark sits within the free space, as (x, y) fractions.
_ANCHORS: dict[str, tuple[float, float]] = {
    "top-left": (0, 0), "top": (0.5, 0), "top-right": (1, 0),
    "left": (0, 0.5), "center": (0.5, 0.5), "right": (1, 0.5),
    "bottom-left": (0, 1), "bottom": (0.5, 1), "bottom-right": (1, 1),
}  # fmt: skip

FONT_PATH = Path(__file__).resolve().parent.parent / "fonts" / "Inter-Medium.ttf"
MARGIN = 0.03  # gap from the edges, as a fraction of the shorter side
_REFERENCE_SIZE = 100  # font size used to measure text before scaling it


@dataclass(frozen=True)
class WatermarkParams:
    text: str | None = None  # exactly one of text or logo
    logo: Image.Image | None = None
    position: Position = "bottom-right"
    opacity: float = 0.5  # 0-1
    scale: float = 0.25  # watermark width as a fraction of the image width
    color: tuple[int, int, int] = (255, 255, 255)  # text only


def watermark(image: Image.Image, params: WatermarkParams) -> Image.Image:
    if (params.text is None) == (params.logo is None):
        raise ValueError("give exactly one of text or logo")

    width, height = image.size
    margin = round(MARGIN * min(width, height))
    free_w, free_h = max(1, width - 2 * margin), max(1, height - 2 * margin)
    target_w = min(max(1, round(params.scale * width)), free_w)

    if params.logo is not None:
        mark = _logo_layer(params.logo, target_w, free_h)
    else:
        mark = _text_layer(params.text, params.color, target_w, free_h)
    mark = _fade(mark, params.opacity).crop((0, 0, min(mark.width, width), min(mark.height, height)))

    fx, fy = _ANCHORS[params.position]
    x = min(max(0, margin + round(fx * (free_w - mark.width))), width - mark.width)
    y = min(max(0, margin + round(fy * (free_h - mark.height))), height - mark.height)

    out = image.convert("RGBA")  # a copy, even when image is already RGBA
    out.alpha_composite(mark, (x, y))
    return out if image.mode == "RGBA" else out.convert("RGB")


def _logo_layer(logo: Image.Image, max_w: int, max_h: int) -> Image.Image:
    w, h = max_w, round(logo.height * max_w / logo.width)
    if h > max_h:
        w, h = round(logo.width * max_h / logo.height), max_h
    return logo.convert("RGBA").resize((max(1, w), max(1, h)), Image.Resampling.LANCZOS)


def _text_layer(text: str, color: tuple[int, int, int], max_w: int, max_h: int) -> Image.Image:
    # Measure once at a reference size; ink and outline scale linearly with it.
    left, top, right, bottom = _font(_REFERENCE_SIZE).getbbox(
        text, stroke_width=_stroke_width(_REFERENCE_SIZE)
    )
    ratio = min(max_w / max(1, right - left), max_h / max(1, bottom - top))
    size = max(1, int(_REFERENCE_SIZE * ratio))

    font, stroke = _font(size), _stroke_width(size)
    left, top, right, bottom = font.getbbox(text, stroke_width=stroke)
    layer = Image.new("RGBA", (max(1, right - left), max(1, bottom - top)))
    ImageDraw.Draw(layer).text(
        (-left, -top),
        text,
        font=font,
        fill=(*color, 255),
        stroke_width=stroke,
        stroke_fill=(*_contrasting(color), 255),  # keeps text legible on any background
    )
    return layer


def _fade(layer: Image.Image, opacity: float) -> Image.Image:
    if opacity < 1:
        layer.putalpha(layer.getchannel("A").point(lambda a: round(a * opacity)))
    return layer


@lru_cache(maxsize=32)
def _font(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT_PATH, size)


def _stroke_width(size: int) -> int:
    return max(1, round(size / 30))


def _contrasting(color: tuple[int, int, int]) -> tuple[int, int, int]:
    r, g, b = color
    return (0, 0, 0) if 0.299 * r + 0.587 * g + 0.114 * b > 140 else (255, 255, 255)
