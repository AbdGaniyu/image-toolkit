"""Endpoints end to end: upload fixtures, check status, headers and the image."""

import asyncio
import io

import pytest
from PIL import Image

from errors import ApiError
from presets import PRESETS
from uploads import MAX_BODY_BYTES, MAX_UPLOAD_BYTES, BodySizeLimit


def image_of(response) -> Image.Image:
    return Image.open(io.BytesIO(response.content))


def filename_of(response) -> str:
    disposition = response.headers["content-disposition"]
    assert disposition.startswith('attachment; filename="')
    return disposition.removeprefix('attachment; filename="').removesuffix('"')


def test_health(client):
    response = client.get("/health")
    assert (response.status_code, response.json()) == (200, {"status": "ok"})


# /convert


@pytest.mark.parametrize(
    "fmt, media_type, pil_format",
    [("jpg", "image/jpeg", "JPEG"), ("png", "image/png", "PNG"), ("webp", "image/webp", "WEBP")],
)
def test_convert_heic_to_each_format(upload, fmt, media_type, pil_format):
    response = upload("/convert", "photo.heic", format=fmt)
    assert response.status_code == 200
    assert response.headers["content-type"] == media_type
    assert filename_of(response) == f"photo.{fmt}"
    assert (image_of(response).format, image_of(response).size) == (pil_format, (64, 48))


def test_convert_to_the_same_format_is_named_compressed(upload):
    response = upload("/convert", "rotated.jpg", format="jpg", quality=40)
    assert filename_of(response) == "rotated-compressed.jpg"


def test_convert_keeps_transparency_for_webp(upload):
    image = image_of(upload("/convert", "alpha.png", format="webp"))
    assert image.mode == "RGBA" and image.getpixel((0, 0))[3] == 0


def test_convert_flattens_transparency_for_jpg(upload):
    image = image_of(upload("/convert", "alpha.png", format="jpg"))
    assert image.mode == "RGB" and image.getpixel((0, 0)) == (255, 255, 255)


def test_convert_applies_orientation(upload):
    assert image_of(upload("/convert", "rotated.jpg", format="png")).size == (40, 60)


def test_convert_strips_metadata_unless_asked(upload):
    stripped = image_of(upload("/convert", "rotated.jpg", format="webp"))
    kept = image_of(upload("/convert", "rotated.jpg", format="webp", keep_metadata="true"))
    assert len(stripped.getexif()) == 0
    assert kept.getexif()[0x010F] == "FixtureCam"
    assert kept.getexif().get_ifd(0x8825)[1] == "N"


def test_download_name_is_made_header_safe(upload):
    response = upload("/convert", "photo.heic", filename='My "Photo" (1).HEIC', format="jpg")
    assert filename_of(response) == "My-Photo-1.jpg"


def test_download_name_falls_back_when_nothing_is_left(upload):
    response = upload("/convert", "photo.heic", filename="фото.heic", format="jpg")
    assert filename_of(response) == "image.jpg"


# /resize


@pytest.mark.parametrize("preset", PRESETS)
def test_resize_presets(upload, preset):
    size = (PRESETS[preset].width, PRESETS[preset].height)
    response = upload("/resize", "bands.png", preset=preset)
    assert response.status_code == 200
    assert image_of(response).size == size
    assert filename_of(response) == f"bands-{size[0]}x{size[1]}.png"


def test_resize_passport_is_written_at_300_dpi(upload):
    image = image_of(upload("/resize", "rotated.jpg", preset="passport"))
    assert image.size == (413, 531)
    assert image.info["dpi"] == (300, 300)


def test_resize_one_side_keeps_aspect_ratio(upload):
    response = upload("/resize", "bands.png", width=300)
    assert image_of(response).size == (300, 100)
    assert filename_of(response) == "bands-300x100.png"


def test_resize_heic_defaults_to_jpg(upload):
    response = upload("/resize", "photo.heic", width=32)
    assert response.headers["content-type"] == "image/jpeg"
    assert filename_of(response) == "photo-32x24.jpg"


def test_resize_contain_with_transparent_background(upload):
    response = upload(
        "/resize", "bands.png", width=100, height=100, fit="contain", background="transparent"
    )
    image = image_of(response)
    assert image.mode == "RGBA" and image.getpixel((50, 2))[3] == 0


def test_resize_contain_with_colour_background(upload):
    response = upload(
        "/resize", "bands.png", width=100, height=100, fit="contain", background="#000000", format="jpg"
    )
    assert image_of(response).getpixel((50, 2)) == (0, 0, 0)


# Errors


@pytest.mark.parametrize(
    "path, fields",
    [
        ("/resize", {"preset": "instagram-post", "width": 100}),
        ("/resize", {}),
        ("/resize", {"preset": "billboard"}),
        ("/resize", {"width": 0}),
        ("/resize", {"width": 10_000, "height": 10_000}),  # 100 MP output
        ("/resize", {"height": 5_000}),  # bands.png is 3:1, so 15000 px wide
        ("/resize", {"width": 100, "fit": "stretch"}),
        ("/resize", {"width": 100, "background": "red"}),
        ("/convert", {"format": "gif"}),
        ("/convert", {"format": "jpg", "quality": 0}),
        ("/convert", {"format": "jpg", "quality": 101}),
        ("/convert", {}),
    ],
)
def test_bad_params_are_422(upload, path, fields):
    response = upload(path, "bands.png", **fields)
    assert response.status_code == 422
    assert response.json()["code"] == "invalid_params"
    assert response.json()["message"]


def test_missing_file(client):
    response = client.post("/convert", data={"format": "jpg"})
    assert response.status_code == 422
    assert response.json()["code"] == "missing_file"


def test_empty_file(client):
    response = client.post("/convert", files={"file": ("a.jpg", b"")}, data={"format": "jpg"})
    assert (response.status_code, response.json()["code"]) == (400, "empty_file")


def test_unsupported_file(upload):
    response = upload("/convert", "not-an-image.txt", format="jpg")
    assert response.status_code == 415
    assert response.json() == {
        "code": "unsupported_type",
        "message": "That file type isn't supported. Use a JPG, PNG, WEBP or HEIC image.",
    }


def test_damaged_image(upload):
    response = upload("/convert", "truncated.jpg", format="jpg")
    assert (response.status_code, response.json()["code"]) == (400, "invalid_image")


def test_file_over_15_mb(client):
    big = b"\0" * (MAX_UPLOAD_BYTES + 1)
    response = client.post("/convert", files={"file": ("big.jpg", big)}, data={"format": "jpg"})
    assert (response.status_code, response.json()["code"]) == (413, "file_too_large")


def test_body_over_the_cap_is_refused_from_content_length_with_cors(client):
    response = client.post(
        "/convert",
        content=b"\0" * (MAX_BODY_BYTES + 1),
        headers={"content-type": "multipart/form-data; boundary=x", "origin": "http://localhost:3000"},
    )
    assert (response.status_code, response.json()["code"]) == (413, "file_too_large")
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"


def test_streamed_body_over_the_cap_is_refused(client):
    def chunks():
        for _ in range(MAX_BODY_BYTES // 2**20 + 2):
            yield b"\0" * 2**20

    response = client.post(
        "/convert", content=chunks(), headers={"content-type": "multipart/form-data; boundary=x"}
    )
    assert "content-length" not in response.request.headers
    assert (response.status_code, response.json()["code"]) == (413, "file_too_large")


def test_body_limit_counts_bytes_without_content_length():
    async def app(scope, receive, send):
        while (await receive()).get("more_body"):
            pass

    messages = iter(
        [
            {"type": "http.request", "body": b"x" * 6, "more_body": True},
            {"type": "http.request", "body": b"x" * 6, "more_body": False},
        ]
    )

    async def receive():
        return next(messages)

    with pytest.raises(ApiError) as err:
        asyncio.run(BodySizeLimit(app, max_bytes=10)({"type": "http", "headers": []}, receive, None))
    assert err.value.status_code == 413


def test_unknown_route_uses_the_error_shape(client):
    response = client.get("/nope")
    assert response.status_code == 404
    assert response.json()["code"] == "not_found"
