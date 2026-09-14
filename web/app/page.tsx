"use client";

import { useState } from "react";
import Dropzone from "@/components/Dropzone";
import { formatBytes, MAX_BATCH } from "@/lib/files";
import { useObjectUrls } from "@/lib/useObjectUrls";

export default function Home() {
  const [files, setFiles] = useState<File[]>([]);
  const previews = useObjectUrls(files);
  const [unpreviewable, setUnpreviewable] = useState<Set<string>>(new Set());

  return (
    <main className="mx-auto flex w-full max-w-content flex-col gap-8 px-gutter py-12 sm:py-20">
      <header className="flex flex-col gap-3">
        <h1 className="font-display text-4xl font-medium tracking-tight text-ink sm:text-5xl">Image Toolkit</h1>
        <p className="max-w-prose text-lg text-ink-mid">
          Remove a background, resize for social, convert and compress, or add a watermark. Nothing is stored.
        </p>
      </header>

      <Dropzone max={MAX_BATCH} onFiles={setFiles} />

      {files.length > 0 && (
        <section aria-label="Chosen images" className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="font-display text-xl font-medium">
              {files.length} {files.length === 1 ? "image" : "images"}
            </h2>
            <button
              type="button"
              onClick={() => setFiles([])}
              className="text-sm text-ink-soft underline underline-offset-4 hover:text-accent"
            >
              Clear
            </button>
          </div>
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {files.map((file, index) => {
              const url = previews[index];
              return (
                <li key={`${file.name}-${index}`} className="flex flex-col gap-2">
                  <div className="flex aspect-square items-center justify-center overflow-hidden rounded-xl border border-line-soft bg-sand">
                    {url && !unpreviewable.has(url) ? (
                      // Object URLs can't go through next/image's optimiser.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={url}
                        alt={file.name}
                        className="size-full object-cover"
                        onError={() => setUnpreviewable((seen) => new Set(seen).add(url))}
                      />
                    ) : (
                      <span className="px-3 text-center text-sm text-ink-muted">
                        {url ? "No preview in this browser" : ""}
                      </span>
                    )}
                  </div>
                  <p className="truncate text-sm text-ink-body" title={file.name}>
                    {file.name}
                  </p>
                  <p className="font-mono text-xs text-ink-meta">{formatBytes(file.size)}</p>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}
