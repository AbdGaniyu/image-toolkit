/** The resize presets. A mirror of api/presets.py; presets.test.ts checks they agree. */
export const PRESETS = [
  { id: "instagram-post", label: "Instagram post", width: 1080, height: 1080 },
  { id: "instagram-story", label: "Instagram story", width: 1080, height: 1920 },
  { id: "x-header", label: "X header", width: 1500, height: 500 },
  { id: "linkedin-banner", label: "LinkedIn banner", width: 1584, height: 396 },
  { id: "whatsapp-dp", label: "WhatsApp DP", width: 640, height: 640 },
  { id: "passport", label: "Passport 35x45 mm", width: 413, height: 531, dpi: 300 },
] as const;

export type PresetId = (typeof PRESETS)[number]["id"];
