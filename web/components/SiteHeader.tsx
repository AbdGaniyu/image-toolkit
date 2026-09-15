"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** The top bar: brand, and a switch between the landing page and the workspace. */
export default function SiteHeader() {
  const onLanding = usePathname() === "/";
  return (
    <header className="nav sticky top-0 z-30 flex-wrap bg-[var(--color-bg)]">
      <Link href="/" className="nav-brand flex items-baseline gap-2.5">
        IMAGE TOOLKIT
        <span className="text-[11px] font-medium tracking-[0.1em] text-[var(--color-accent-700)] uppercase [font-family:var(--font-body)]">
          Nothing is stored
        </span>
      </Link>
      {/* Phones reach the workspace through the tool cards and come back with "←". */}
      <nav aria-label="Screens" className="seg flex-wrap max-sm:hidden">
        <Link href="/" className="seg-opt" aria-current={onLanding ? "page" : undefined}>
          Landing
        </Link>
        <Link href="/remove-bg" className="seg-opt" aria-current={onLanding ? undefined : "page"}>
          Workspace
        </Link>
      </nav>
    </header>
  );
}
