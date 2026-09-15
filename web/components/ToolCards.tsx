import Link from "next/link";
import type { ReactNode } from "react";
import type { Endpoint } from "@/lib/api";

type Card = { slug: Endpoint; title: string; blurb: string; art: ReactNode };

// The illustrations loop only while their card is hovered or focused (toolkit.css).
const CARDS: readonly Card[] = [
  {
    slug: "remove-bg",
    title: "Remove background",
    blurb: "One button. Then drop it on white, black, or keep it transparent.",
    art: (
      <div className="checker-sm relative h-16 w-24 overflow-hidden">
        <div className="absolute bottom-0 left-[30px] h-[46px] w-9 bg-[var(--color-text)]" />
        <div className="absolute bottom-0 left-3.5 h-[22px] w-[18px] bg-[var(--color-text)]" />
        <div className="anim-bg absolute inset-0 translate-x-[106%] bg-[var(--color-neutral-200)]" />
      </div>
    ),
  },
  {
    slug: "resize",
    title: "Resize to preset",
    blurb: "Platform sizes as chips, or type your own with the ratio locked.",
    art: (
      <div className="relative h-16 w-24">
        <div className="absolute top-1.5 left-0 h-[52px] w-[52px] bg-[var(--color-neutral-200)]" />
        <div className="anim-resize absolute top-1.5 left-0 box-border h-[52px] w-10 border-2 border-[var(--color-accent)]" />
      </div>
    ),
  },
  {
    slug: "convert",
    title: "Convert & compress",
    blurb: "JPG, PNG, WEBP, with an estimate of the file size as you move the slider.",
    art: (
      <div className="flex h-16 w-24 items-end gap-1.5">
        <div className="anim-convert h-[58px] w-5 origin-bottom bg-[var(--color-text)]" />
        <div className="anim-convert-2 h-[58px] w-5 origin-bottom bg-[var(--color-neutral-400)]" />
        <div className="anim-convert-3 h-[58px] w-5 origin-bottom bg-[var(--color-accent)]" />
      </div>
    ),
  },
  {
    slug: "watermark",
    title: "Watermark",
    blurb: "Text or a logo, nine positions, opacity and scale — previewed on the image.",
    art: (
      <div className="relative h-16 w-24 overflow-hidden bg-[var(--color-neutral-200)]">
        <div className="anim-wm absolute right-1.5 bottom-1.5 flex items-center gap-1">
          <div className="size-2.5 bg-[var(--color-accent)]" />
          <div className="h-1.5 w-[34px] bg-[var(--color-text)]" />
        </div>
      </div>
    ),
  },
];

export default function ToolCards() {
  return (
    <nav aria-label="Tools">
      {/* Phones get the design's compact 2×2 grid: art and title only. */}
      <ul className="grid list-none grid-cols-[repeat(auto-fit,minmax(232px,1fr))] gap-[2px] border-2 border-[var(--color-divider)] bg-[var(--color-divider)] p-0 max-sm:grid-cols-2">
        {CARDS.map((card) => (
          <li key={card.slug} className="flex">
            <Link
              href={`/${card.slug}`}
              className="tool-card flex min-h-[236px] flex-1 flex-col gap-3 bg-[var(--color-bg)] p-4 text-[var(--color-text)] no-underline hover:bg-[var(--color-neutral-100)] hover:text-[var(--color-text)] max-sm:min-h-[120px] max-sm:gap-2 max-sm:p-3"
            >
              <span aria-hidden="true">{card.art}</span>
              <span className="heading text-[19px] leading-[1.15] max-sm:text-[14px]">{card.title}</span>
              <span className="flex-1 text-[13px] leading-normal opacity-80 max-sm:hidden">{card.blurb}</span>
              <span className="text-xs tracking-[0.08em] text-[var(--color-accent-700)] uppercase max-sm:hidden">Open</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
