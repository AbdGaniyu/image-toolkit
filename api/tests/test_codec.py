import io

import pytest
from PIL import Image, ImageCms

import codec
from errors import ApiError


def near(actual, expected, tol=16):
    return all(abs(a - e) <= tol for a, e in zip(actual, expected))


def reopen(data: bytes) -> Image.Image:
    return Image.open(io.BytesIO(data))


@pytest.mark.parametrize(
    "name, fmt, mode, size",
    [
        ("bands.png", "png", "RGB", (600, 200)),
        ("alpha.png", "png", "RGBA", (80, 80)),
        ("photo.webp", "webp", "RGB", (64, 48)),
        ("photo.heic", "heic", "RGB", (64, 48)),
        ("rotated.jpg", "jpg", "RGB", (40, 60)),
    ],
)
def test_decode_formats(fixture_bytes, name, fmt, mode, size):
    src = codec.decode(fixture_bytes(name))
    assert (src.format, src.image.mode, src.image.size) == (fmt, mode, size)
    assert src.image.info == {}


def test_decode_applies_exif_orientation(fixture_bytes):
    image = codec.decode(fixture_bytes("rotated.jpg")).image
    assert near(image.getpixel((20, 5)), (255, 0, 0))  # stored left edge is the visual top
    assert near(image.getpixel((20, 54)), (0, 0, 255))


def test_decode_sets_exif_aside_without_orientation(fixture_bytes):
    src = codec.decode(fixture_bytes("rotated.jpg"))
    exif = Image.Exif()
    exif.load(src.exif)
    assert exif[0x010F] == "FixtureCam"
    assert exif.get(0x0112, 1) == 1  # pixels are already upright


def test_decode_palette_transparency_becomes_rgba(fixture_bytes):
    image = codec.decode(fixture_bytes("palette.png")).image
    assert image.mode == "RGBA"
    assert image.getpixel((0, 0))[3] == 0
    assert image.getpixel((10, 10)) == (0, 0, 255, 255)


def test_decode_scales_16_bit_greyscale(fixture_bytes):
    image = codec.decode(fixture_bytes("gray16.png")).image
    assert image.mode == "RGB"
    assert near(image.getpixel((0, 0)), (128, 128, 128), tol=2)


def test_decode_cmyk_becomes_rgb(fixture_bytes):
    src = codec.decode(fixture_bytes("cmyk.jpg"))
    assert src.image.mode == "RGB"
    assert near(src.image.getpixel((16, 16)), (255, 0, 0), tol=24)
    assert src.icc_profile is None


@pytest.mark.parametrize(
    "name, status, code",
    [
        ("not-an-image.txt", 415, "unsupported_type"),
        ("truncated.jpg", 400, "invalid_image"),
    ],
)
def test_decode_rejects_bad_files(fixture_bytes, name, status, code):
    with pytest.raises(ApiError) as err:
        codec.decode(fixture_bytes(name))
    assert (err.value.status_code, err.value.code) == (status, code)


def test_decode_rejects_other_image_formats():
    gif = io.BytesIO()
    Image.new("RGB", (4, 4)).save(gif, "GIF")
    with pytest.raises(ApiError) as err:
        codec.decode(gif.getvalue())
    assert (err.value.status_code, err.value.code) == (415, "unsupported_type")


def test_decode_rejects_too_many_pixels(fixture_bytes, monkeypatch):
    monkeypatch.setattr(codec, "MAX_PIXELS", 100)
    with pytest.raises(ApiError) as err:
        codec.decode(fixture_bytes("bands.png"))
    assert (err.value.status_code, err.value.code) == (413, "image_too_large")


@pytest.mark.parametrize("fmt", ["jpg", "png", "webp"])
def test_encode_writes_no_exif_by_default(fixture_bytes, fmt):
    src = codec.decode(fixture_bytes("rotated.jpg"))
    assert len(reopen(codec.encode(src.image, fmt, quality=80)).getexif()) == 0


@pytest.mark.parametrize("fmt", ["jpg", "png", "webp"])
def test_encode_keeps_exif_including_gps_when_given(fixture_bytes, fmt):
    src = codec.decode(fixture_bytes("rotated.jpg"))
    exif = reopen(codec.encode(src.image, fmt, quality=80, exif=src.exif)).getexif()
    assert exif[0x010F] == "FixtureCam"
    assert exif.get_ifd(0x8825)[1] == "N"
    assert exif.get(0x0112, 1) == 1


@pytest.mark.parametrize("fmt", ["jpg", "png", "webp"])
def test_encode_keeps_the_colour_profile(fmt):
    icc = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()
    out = reopen(codec.encode(Image.new("RGB", (8, 8)), fmt, quality=80, icc_profile=icc))
    assert out.info["icc_profile"] == icc


@pytest.mark.parametrize("fmt", ["jpg", "webp"])
def test_encode_quality_trades_size(fmt):
    noise = Image.effect_noise((200, 200), 64).convert("RGB")
    low = codec.encode(noise, fmt, quality=20)
    high = codec.encode(noise, fmt, quality=95)
    assert len(low) < len(high)


def test_encode_sets_dpi():
    out = reopen(codec.encode(Image.new("RGB", (8, 8)), "jpg", quality=90, dpi=300))
    assert out.info["dpi"] == (300, 300)
