import pytest
from PIL import Image

from ops.resize import TRANSPARENT, ResizeParams, resize, target_size
from presets import PRESETS

RED, GREEN, BLUE, WHITE = (255, 0, 0), (0, 255, 0), (0, 0, 255), (255, 255, 255)


def near(actual, expected, tol=12):
    return all(abs(a - e) <= tol for a, e in zip(actual, expected))


def bands() -> Image.Image:
    """600x200: red | green | blue thirds."""
    image = Image.new("RGB", (600, 200))
    for i, colour in enumerate((RED, GREEN, BLUE)):
        image.paste(colour, (i * 200, 0, (i + 1) * 200, 200))
    return image


def test_cover_fills_the_box_by_cropping_the_centre():
    out = resize(bands(), ResizeParams(100, 100, "cover"))
    assert out.size == (100, 100)
    for xy in [(5, 50), (94, 50), (50, 5), (50, 94)]:
        assert near(out.getpixel(xy), GREEN)


def test_contain_fits_inside_and_pads_with_white():
    out = resize(bands(), ResizeParams(100, 100, "contain"))
    assert (out.size, out.mode) == ((100, 100), "RGB")
    assert out.getpixel((50, 2)) == WHITE and out.getpixel((50, 97)) == WHITE
    assert near(out.getpixel((5, 50)), RED)
    assert near(out.getpixel((50, 50)), GREEN)


def test_contain_pads_with_a_given_colour():
    out = resize(bands(), ResizeParams(100, 100, "contain", background=(0, 0, 0, 255)))
    assert out.getpixel((50, 2)) == (0, 0, 0)


def test_contain_transparent_background():
    out = resize(bands(), ResizeParams(100, 100, "contain", background=TRANSPARENT))
    assert out.mode == "RGBA"
    assert out.getpixel((50, 2))[3] == 0
    assert out.getpixel((50, 50))[3] == 255


def test_contain_keeps_transparency_of_images_with_alpha_by_default():
    logo = Image.new("RGBA", (50, 50), (*RED, 255))
    out = resize(logo, ResizeParams(100, 50, "contain"))
    assert out.mode == "RGBA"
    assert out.getpixel((10, 25))[3] == 0
    assert out.getpixel((50, 25)) == (*RED, 255)


@pytest.mark.parametrize(
    "params, size",
    [
        (ResizeParams(width=300), (300, 100)),
        (ResizeParams(height=50), (150, 50)),
        (ResizeParams(width=1200), (1200, 400)),  # upscaling is allowed
    ],
)
def test_one_side_keeps_the_aspect_ratio(params, size):
    assert resize(bands(), params).size == size


def test_target_size_needs_a_side():
    with pytest.raises(ValueError):
        target_size((10, 10), ResizeParams())


def test_target_size_never_rounds_to_zero():
    assert target_size((1000, 1), ResizeParams(width=10)) == (10, 1)


def test_presets_match_the_spec():
    sizes = {name: (p.width, p.height, p.dpi) for name, p in PRESETS.items()}
    assert sizes == {
        "instagram-post": (1080, 1080, None),
        "instagram-story": (1080, 1920, None),
        "x-header": (1500, 500, None),
        "linkedin-banner": (1584, 396, None),
        "whatsapp-dp": (640, 640, None),
        "passport": (413, 531, 300),  # 35x45 mm at 300 dpi
    }
