"""Remove the background: u2net predicts a soft mask, which becomes the alpha channel."""

from functools import lru_cache

from PIL import Image
from rembg import new_session, remove
from rembg.sessions.base import BaseSession

MODEL = "u2net"


@lru_cache(maxsize=1)
def _session() -> BaseSession:
    # Loaded once per process. The Docker image has the model baked in (see
    # api/Dockerfile); anywhere else rembg downloads it (176 MB) on first use.
    return new_session(MODEL)


def remove_bg(image: Image.Image) -> Image.Image:
    """RGBA cutout. Pixels that were already transparent stay transparent."""
    # rembg composites onto a transparent RGBA canvas, so hand it RGBA.
    return remove(image.convert("RGBA"), session=_session())
