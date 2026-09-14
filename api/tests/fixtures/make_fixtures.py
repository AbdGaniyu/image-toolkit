"""Regenerate the fixture images: `.venv/bin/python tests/fixtures/make_fixtures.py`.

Tiny synthetic pictures, each exercising one decode path.
"""

import io
from pathlib import Path

import pillow_heif
from PIL import Image

HERE = Path(__file__).parent
RED, GREEN, BLUE = (255, 0, 0), (0, 255, 0), (0, 0, 255)


def main() -> None:
    pillow_heif.register_heif_opener()

    # 600x200: red | green | blue thirds. Cover crops keep the green middle.
    bands = Image.new("RGB", (600, 200))
    for i, colour in enumerate((RED, GREEN, BLUE)):
        bands.paste(colour, (i * 200, 0, (i + 1) * 200, 200))
    bands.save(HERE / "bands.png")

    # Stored 60x40, left half red, right half blue. EXIF orientation 6 means
    # "rotate 90 degrees clockwise to view" (a phone held upright), so it
    # displays 40x60 with red on top. Camera and GPS tags for metadata tests.
    rotated = Image.new("RGB", (60, 40), BLUE)
    rotated.paste(RED, (0, 0, 30, 40))
    exif = Image.Exif()
    exif[0x0112] = 6  # Orientation
    exif[0x010F] = "FixtureCam"  # Make
    exif[0x8825] = {1: "N", 2: (6.0, 27.0, 0.0), 3: "E", 4: (3.0, 23.0, 0.0)}  # GPSInfo
    rotated.save(HERE / "rotated.jpg", quality=95, exif=exif.tobytes())

    # 80x80 transparent with an opaque red 40x40 square in the middle.
    alpha = Image.new("RGBA", (80, 80), (0, 0, 0, 0))
    alpha.paste((*RED, 255), (20, 20, 60, 60))
    alpha.save(HERE / "alpha.png")

    # Palette PNG, index 0 transparent, blue square: must become RGBA.
    palette = Image.new("P", (20, 20), 0)
    palette.putpalette([0, 0, 0, *BLUE])
    palette.paste(1, (5, 5, 15, 15))
    palette.save(HERE / "palette.png", transparency=0)

    # 16-bit greyscale at half intensity: must decode to ~128, not white.
    Image.new("I;16", (32, 8), 32768).save(HERE / "gray16.png")

    # CMYK JPEG (print exports): C0 M100 Y100 K0 is red.
    Image.new("CMYK", (32, 32), (0, 255, 255, 0)).save(HERE / "cmyk.jpg", quality=95)

    Image.new("RGB", (64, 48), GREEN).save(HERE / "photo.webp", quality=90)
    Image.new("RGB", (64, 48), BLUE).save(HERE / "photo.heic", quality=90)

    # First half of a noisy JPEG: opens fine, fails when the pixels are read.
    noisy = io.BytesIO()
    Image.effect_noise((128, 128), 64).convert("RGB").save(noisy, "JPEG", quality=90)
    (HERE / "truncated.jpg").write_bytes(noisy.getvalue()[: len(noisy.getvalue()) // 2])

    (HERE / "not-an-image.txt").write_text("definitely not an image\n")


if __name__ == "__main__":
    main()
