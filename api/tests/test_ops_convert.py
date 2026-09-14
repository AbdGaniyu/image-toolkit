import pytest
from PIL import Image

from ops.convert import ConvertParams, convert


def logo() -> Image.Image:
    """40x40 transparent with an opaque red 20x20 square in the middle."""
    image = Image.new("RGBA", (40, 40), (0, 0, 0, 0))
    image.paste((255, 0, 0, 255), (10, 10, 30, 30))
    return image


def test_jpg_flattens_transparency_onto_white():
    out = convert(logo(), ConvertParams("jpg"))
    assert out.mode == "RGB"
    assert out.getpixel((0, 0)) == (255, 255, 255)
    assert out.getpixel((20, 20)) == (255, 0, 0)


def test_jpg_flattens_onto_a_given_colour():
    out = convert(logo(), ConvertParams("jpg", background=(0, 0, 0)))
    assert out.getpixel((0, 0)) == (0, 0, 0)


@pytest.mark.parametrize("fmt", ["png", "webp"])
def test_png_and_webp_keep_transparency(fmt):
    out = convert(logo(), ConvertParams(fmt))
    assert out.mode == "RGBA"
    assert out.getpixel((0, 0))[3] == 0


@pytest.mark.parametrize("fmt", ["jpg", "png", "webp"])
def test_unused_alpha_channel_is_dropped(fmt):
    opaque = Image.new("RGBA", (8, 8), (1, 2, 3, 255))
    out = convert(opaque, ConvertParams(fmt))
    assert out.mode == "RGB"
    assert out.getpixel((0, 0)) == (1, 2, 3)


@pytest.mark.parametrize("fmt", ["jpg", "png", "webp"])
def test_rgb_passes_through(fmt):
    image = Image.new("RGB", (8, 8), (1, 2, 3))
    assert convert(image, ConvertParams(fmt)) is image
