from PIL import Image, ImageDraw

from ops.remove_bg import remove_bg

MODEL_INPUT = (1, 3, 320, 320)


def test_mask_becomes_the_alpha_channel(fake_u2net):
    out = remove_bg(Image.new("RGB", (40, 20), (10, 120, 200)))
    assert (out.mode, out.size) == ("RGBA", (40, 20))
    assert out.getpixel((5, 10)) == (10, 120, 200, 255)  # foreground kept as is
    assert out.getpixel((35, 10))[3] == 0  # background gone
    assert fake_u2net.seen == [MODEL_INPUT]


def test_existing_transparency_is_kept(fake_u2net):
    image = Image.new("RGBA", (40, 20), (255, 0, 0, 255))
    image.putpixel((5, 10), (255, 0, 0, 0))
    out = remove_bg(image)
    assert out.getpixel((5, 10))[3] == 0
    assert out.getpixel((6, 10))[3] == 255


def test_large_images_are_inferred_small_but_cut_out_at_full_size(fake_u2net):
    image = Image.new("RGB", (4000, 1000), (10, 120, 200))
    image.putpixel((1, 1), (255, 255, 0))  # a detail a downscale would lose
    out = remove_bg(image)
    assert fake_u2net.seen == [MODEL_INPUT]
    assert out.size == (4000, 1000)
    assert out.getpixel((1, 1)) == (255, 255, 0, 255)  # original pixels, not upscaled
    assert out.getpixel((1000, 500))[3] == 255
    assert out.getpixel((3000, 500))[3] == 0


def test_real_u2netp_cuts_out_an_object():
    image = Image.new("RGB", (320, 320), (245, 245, 245))
    ImageDraw.Draw(image).ellipse((80, 80, 240, 240), fill=(170, 30, 40))
    out = remove_bg(image)
    assert out.getpixel((160, 160))[3] > 200  # the disc stays
    assert out.getpixel((10, 10))[3] < 30  # the plain background goes
