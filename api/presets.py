"""Resize presets. web/lib/presets.ts mirrors this list; change both together."""

from dataclasses import dataclass


@dataclass(frozen=True)
class Preset:
    label: str
    width: int
    height: int
    dpi: int | None = None  # written into the file; only print sizes need it


def _mm_to_px(mm: float, dpi: int) -> int:
    return round(mm / 25.4 * dpi)


PRESETS: dict[str, Preset] = {
    "instagram-post": Preset("Instagram post", 1080, 1080),
    "instagram-story": Preset("Instagram story", 1080, 1920),
    "x-header": Preset("X header", 1500, 500),
    "linkedin-banner": Preset("LinkedIn banner", 1584, 396),
    "whatsapp-dp": Preset("WhatsApp DP", 640, 640),
    "passport": Preset("Passport 35x45 mm", _mm_to_px(35, 300), _mm_to_px(45, 300), dpi=300),
}
