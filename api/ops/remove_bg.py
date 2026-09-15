"""Remove the background: u2netp predicts a soft mask, which becomes the alpha channel.

The model runs directly on onnxruntime. rembg did the same underneath, but
importing it also loaded scipy, numba and pymatting (~540 MB of memory before
any request). The pre- and post-processing below match what rembg did for u2netp.
"""

import hashlib
import os
import urllib.request
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image

MODEL_URL = "https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx"
MODEL_SHA256 = "309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8"
# The Docker image bakes the model into /models (see api/Dockerfile).
MODEL_PATH = Path(os.environ.get("MODEL_DIR") or Path.home() / ".cache" / "image-toolkit") / "u2netp.onnx"

INPUT_SIZE = (320, 320)  # what u2netp takes, whatever the image size
MEAN = (0.485, 0.456, 0.406)
STD = (0.229, 0.224, 0.225)


def _model_file() -> Path:
    """The model's path, downloading it (4.7 MB, checksum-verified) if it's missing."""
    if not MODEL_PATH.exists():
        with urllib.request.urlopen(MODEL_URL, timeout=60) as response:
            data = response.read()
        if hashlib.sha256(data).hexdigest() != MODEL_SHA256:
            raise RuntimeError(f"{MODEL_URL} doesn't match its checksum")
        MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
        partial = MODEL_PATH.with_suffix(".part")
        partial.write_bytes(data)
        partial.replace(MODEL_PATH)
    return MODEL_PATH


# One session per process, created at import and shared by every request (never
# per call): it holds the model weights and onnxruntime's memory arena.
SESSION = ort.InferenceSession(str(_model_file()), providers=["CPUExecutionProvider"])
_INPUT = SESSION.get_inputs()[0].name


def remove_bg(image: Image.Image) -> Image.Image:
    """RGBA cutout. Pixels that were already transparent stay transparent."""
    rgba = image.convert("RGBA")
    mask = predict_mask(rgba)
    # What rembg's naive_cutout does: keep the original pixels where the mask says so.
    return Image.composite(rgba, Image.new("RGBA", rgba.size, 0), mask)


def predict_mask(image: Image.Image) -> Image.Image:
    """Soft foreground mask ("L") at the image's size.

    The model only ever sees a 320x320 copy, however big the image; its mask is
    scaled back up, and the cutout keeps the full-resolution pixels.
    """
    small = image.convert("RGB").resize(INPUT_SIZE, Image.Resampling.LANCZOS)
    pixels = np.asarray(small, dtype=np.float64)
    pixels /= max(pixels.max(), 1e-6)  # as rembg: scaled by the brightest value, not 255
    pixels = (pixels - MEAN) / STD
    tensor = pixels.transpose(2, 0, 1)[np.newaxis].astype(np.float32)

    pred = SESSION.run(None, {_INPUT: tensor})[0][0, 0]
    pred = (pred - pred.min()) / max(pred.max() - pred.min(), 1e-6)
    mask = Image.fromarray((pred * 255).astype(np.uint8))
    return mask.resize(image.size, Image.Resampling.LANCZOS)
