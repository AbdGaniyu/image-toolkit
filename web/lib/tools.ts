import type { Endpoint } from "./api";

export type Tool = {
  /** Route (/remove-bg) and API endpoint (POST /remove-bg). */
  slug: Endpoint;
  name: string;
  blurb: string;
  /** Label of the button that runs it. */
  action: string;
};

export const TOOLS: readonly Tool[] = [
  {
    slug: "remove-bg",
    name: "Remove background",
    blurb: "Cut out the subject and get a PNG with a transparent background.",
    action: "Remove background",
  },
  {
    slug: "resize",
    name: "Resize & crop",
    blurb: "Exact sizes for Instagram, X, LinkedIn, WhatsApp and passport photos, or your own.",
    action: "Resize",
  },
  {
    slug: "convert",
    name: "Convert & compress",
    blurb: "Turn any photo, HEIC included, into JPG, PNG or WEBP at the quality you choose.",
    action: "Convert",
  },
  {
    slug: "watermark",
    name: "Watermark",
    blurb: "Stamp your name or logo on a photo before you share it.",
    action: "Add watermark",
  },
];

export const TOOL_BY_SLUG = Object.fromEntries(TOOLS.map((tool) => [tool.slug, tool])) as Record<Endpoint, Tool>;

export function getTool(slug: string): Tool | undefined {
  return TOOLS.find((tool) => tool.slug === slug);
}
