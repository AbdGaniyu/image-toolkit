import type { Endpoint } from "./api";

export type Tool = {
  /** Route (/remove-bg) and API endpoint (POST /remove-bg). */
  slug: Endpoint;
  name: string;
  blurb: string;
  /** Label of the button that runs it. */
  action: string;
  /** Set for tools that take up to 10 images at once: the name of their "Download all" ZIP. */
  batchZipName?: string;
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
    blurb: "Exact sizes for Instagram, X, LinkedIn, WhatsApp and passport photos, or your own. Up to 10 at once.",
    action: "Resize",
    batchZipName: "resized-images.zip",
  },
  {
    slug: "convert",
    name: "Convert & compress",
    blurb: "Turn any photo, HEIC included, into JPG, PNG or WEBP at the quality you choose. Up to 10 at once.",
    action: "Convert",
    batchZipName: "converted-images.zip",
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
