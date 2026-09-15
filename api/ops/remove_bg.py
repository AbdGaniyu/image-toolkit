"""Remove the background: u2netp predicts a soft mask, which becomes the alpha channel."""

from PIL import Image
from rembg import new_session

MODEL = "u2netp"
# Longest side the model is run on. u2netp sees a 320x320 thumbnail either way;
# this caps the intermediate copies and the predicted mask, which rembg sizes to
# its input. The cutout itself is always the full-resolution original.
MAX_INFERENCE_SIDE = 1600

# One session per process, created at import and shared by every request (never
# per call): it holds the model weights and onnxruntime's memory arena. The
# Docker image has the model baked in (see api/Dockerfile); anywhere else rembg
# downloads it (4.7 MB) here, on first import.
SESSION = new_session(MODEL)


def remove_bg(image: Image.Image) -> Image.Image:
    """RGBA cutout. Pixels that were already transparent stay transparent."""
    rgba = image.convert("RGBA")
    probe = rgba
    scale = MAX_INFERENCE_SIDE / max(rgba.size)
    if scale < 1:
        size = (max(1, round(rgba.width * scale)), max(1, round(rgba.height * scale)))
        probe = rgba.resize(size, Image.Resampling.LANCZOS)
    mask = SESSION.predict(probe)[0]
    if mask.size != rgba.size:
        mask = mask.resize(rgba.size, Image.Resampling.LANCZOS)
    # What rembg's naive_cutout does: keep the original pixels where the mask says so.
    return Image.composite(rgba, Image.new("RGBA", rgba.size, 0), mask)
