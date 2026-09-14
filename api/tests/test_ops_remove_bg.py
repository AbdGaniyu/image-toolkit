import pytest
from PIL import Image, ImageDraw

from ops.remove_bg import remove_bg


def test_mask_becomes_the_alpha_channel(fake_u2net):
    out = remove_bg(Image.new("RGB", (40, 20), (10, 120, 200)))
    assert (out.mode, out.size) == ("RGBA", (40, 20))
    assert out.getpixel((5, 10)) == (10, 120, 200, 255)  # foreground kept as is
    assert out.getpixel((35, 10))[3] == 0  # background gone


def test_existing_transparency_is_kept(fake_u2net):
    image = Image.new("RGBA", (40, 20), (255, 0, 0, 255))
    image.putpixel((5, 10), (255, 0, 0, 0))
    out = remove_bg(image)
    assert out.getpixel((5, 10))[3] == 0
    assert out.getpixel((6, 10))[3] == 255


def _model_on_disk() -> bool:
    try:
        from rembg.sessions.u2net import U2netSession

        return U2netSession.resolve_existing("u2net.onnx") is not None
    except Exception:
        return False


@pytest.mark.skipif(
    not _model_on_disk(),
    reason="u2net model not downloaded (176 MB); see README 'Background removal model'",
)
def test_real_u2net_cuts_out_an_object():
    image = Image.new("RGB", (320, 320), (245, 245, 245))
    ImageDraw.Draw(image).ellipse((80, 80, 240, 240), fill=(170, 30, 40))
    out = remove_bg(image)
    assert out.getpixel((160, 160))[3] > 200  # the disc stays
    assert out.getpixel((10, 10))[3] < 30  # the plain background goes
