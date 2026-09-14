import pytest
from PIL import Image, ImageChops

from ops.watermark import WatermarkParams, watermark

WHITE, BLACK, RED = (255, 255, 255), (0, 0, 0), (255, 0, 0)


def near(actual, expected, tol=3):
    return all(abs(a - e) <= tol for a, e in zip(actual, expected))


def ink(before: Image.Image, after: Image.Image) -> tuple[int, int, int, int] | None:
    """Bounding box of the pixels the watermark changed."""
    return ImageChops.difference(before.convert("RGB"), after.convert("RGB")).getbbox()


def logo(size=(20, 20), colour=(*RED, 255)) -> Image.Image:
    return Image.new("RGBA", size, colour)


# 200x100 image: margin 3 px, 194x94 free, a 20x20 logo at scale 0.1.
@pytest.mark.parametrize(
    "position, box",
    [
        ("top-left", (3, 3, 23, 23)),
        ("top", (90, 3, 110, 23)),
        ("top-right", (177, 3, 197, 23)),
        ("left", (3, 40, 23, 60)),
        ("center", (90, 40, 110, 60)),
        ("right", (177, 40, 197, 60)),
        ("bottom-left", (3, 77, 23, 97)),
        ("bottom", (90, 77, 110, 97)),
        ("bottom-right", (177, 77, 197, 97)),
    ],
)
def test_logo_positions(position, box):
    base = Image.new("RGB", (200, 100), WHITE)
    out = watermark(base, WatermarkParams(logo=logo(), position=position, opacity=1, scale=0.1))
    assert ink(base, out) == box


def test_logo_opacity_blends():
    base = Image.new("RGB", (200, 100), WHITE)
    out = watermark(base, WatermarkParams(logo=logo(), position="center", opacity=0.5, scale=0.1))
    assert near(out.getpixel((100, 50)), (255, 127, 127))


def test_logo_transparency_is_respected():
    ring = logo((20, 20), (0, 0, 0, 0))
    ring.paste((*RED, 255), (5, 5, 15, 15))
    base = Image.new("RGB", (200, 100), WHITE)
    out = watermark(base, WatermarkParams(logo=ring, position="top-left", opacity=1, scale=0.1))
    assert ink(base, out) == (8, 8, 18, 18)


@pytest.mark.parametrize(
    "logo_size, scale, drawn",
    [
        ((10, 10), 0.25, (50, 50)),
        ((40, 10), 0.5, (100, 25)),  # aspect ratio kept
        ((10, 10), 0.5, (94, 94)),  # 100 px tall won't fit in 94: shrunk to fit
    ],
)
def test_logo_scale(logo_size, scale, drawn):
    base = Image.new("RGB", (200, 100), WHITE)
    out = watermark(base, WatermarkParams(logo=logo(logo_size), position="center", opacity=1, scale=scale))
    left, top, right, bottom = ink(base, out)
    assert (right - left, bottom - top) == drawn


def test_text_is_scaled_to_the_width_and_placed():
    base = Image.new("RGB", (400, 200), BLACK)
    out = watermark(base, WatermarkParams(text="Studio Lagos", opacity=1, scale=0.5))
    left, top, right, bottom = ink(base, out)
    assert 180 <= right - left <= 200  # 0.5 x 400, less the (invisible) black outline
    assert 380 <= right <= 394 and 180 <= bottom <= 194  # bottom-right, 6 px margin


def test_text_shrinks_to_fit_a_short_image():
    base = Image.new("RGB", (400, 40), BLACK)
    out = watermark(base, WatermarkParams(text="Hi", opacity=1, scale=1))
    left, top, right, bottom = ink(base, out)
    assert top >= 1 and bottom <= 39


def test_text_colour_and_contrasting_outline():
    base = Image.new("RGB", (400, 200), (0, 128, 0))
    out = watermark(base, WatermarkParams(text="I", opacity=1, scale=0.5, color=WHITE, position="center"))
    colours = {colour for _, colour in out.getcolors(maxcolors=100_000)}
    assert WHITE in colours  # the fill
    assert BLACK in colours  # the outline around light text


def test_rgba_image_keeps_its_transparency():
    base = Image.new("RGBA", (100, 100), (0, 0, 0, 0))
    out = watermark(base, WatermarkParams(logo=logo(), position="center", opacity=1, scale=0.2))
    assert out.mode == "RGBA"
    assert out.getpixel((0, 0))[3] == 0
    assert out.getpixel((50, 50)) == (*RED, 255)


def test_input_is_not_modified():
    base = Image.new("RGB", (100, 100), WHITE)
    watermark(base, WatermarkParams(text="x", opacity=1))
    assert base.getcolors() == [(100 * 100, WHITE)]


def test_tiny_image_does_not_crash():
    out = watermark(Image.new("RGB", (3, 3)), WatermarkParams(text="Studio", opacity=1, scale=1))
    assert out.size == (3, 3)


@pytest.mark.parametrize("params", [WatermarkParams(), WatermarkParams(text="x", logo=logo())])
def test_exactly_one_of_text_or_logo(params):
    with pytest.raises(ValueError):
        watermark(Image.new("RGB", (10, 10)), params)
