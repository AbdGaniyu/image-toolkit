"use client";

import { useEffect, useState } from "react";

/** Object URLs for showing files instantly; revoked when the files change or the component goes. */
export function useObjectUrls(files: readonly Blob[]): string[] {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    const next = files.map((file) => URL.createObjectURL(file));
    setUrls(next);
    return () => next.forEach((url) => URL.revokeObjectURL(url));
  }, [files]);
  return urls;
}
