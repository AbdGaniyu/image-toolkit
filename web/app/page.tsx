import Link from "next/link";
import { TOOLS } from "@/lib/tools";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-content flex-col gap-10 px-gutter py-12 sm:py-20">
      <header className="flex flex-col gap-3">
        <h1 className="font-display text-4xl font-medium tracking-tight text-ink sm:text-5xl">Image Toolkit</h1>
        <p className="max-w-prose text-lg text-ink-mid">
          Pick a tool, drop in an image, download the result. Phone photos welcome, HEIC included. Nothing is
          stored.
        </p>
      </header>

      <nav aria-label="Tools">
        <ul className="grid gap-4 sm:grid-cols-2">
          {TOOLS.map((tool) => (
            <li key={tool.slug}>
              <Link
                href={`/${tool.slug}`}
                className="group flex h-full flex-col gap-2 rounded-2xl border border-line bg-paper p-6 transition-colors hover:border-accent"
              >
                <span className="flex items-center justify-between gap-4 font-display text-xl font-medium text-ink">
                  {tool.name}
                  <span aria-hidden="true" className="text-accent transition-transform group-hover:translate-x-0.5">
                    →
                  </span>
                </span>
                <span className="text-ink-mid">{tool.blurb}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </main>
  );
}
