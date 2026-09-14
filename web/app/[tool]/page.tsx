import type { ComponentType } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ConvertTool from "@/components/tools/ConvertTool";
import RemoveBgTool from "@/components/tools/RemoveBgTool";
import ResizeTool from "@/components/tools/ResizeTool";
import WatermarkTool from "@/components/tools/WatermarkTool";
import type { Endpoint } from "@/lib/api";
import { getTool, TOOLS } from "@/lib/tools";

const WORKSPACES: Record<Endpoint, ComponentType> = {
  "remove-bg": RemoveBgTool,
  resize: ResizeTool,
  convert: ConvertTool,
  watermark: WatermarkTool,
};

// Exactly the four tools; anything else is a 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return TOOLS.map((tool) => ({ tool: tool.slug }));
}

type Props = { params: Promise<{ tool: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tool = getTool((await params).tool);
  return tool ? { title: `${tool.name} · Image Toolkit`, description: tool.blurb } : {};
}

export default async function ToolPage({ params }: Props) {
  const tool = getTool((await params).tool);
  if (!tool) notFound();
  const Workspace = WORKSPACES[tool.slug];

  return (
    <main className="mx-auto flex w-full max-w-content flex-col gap-8 px-gutter py-8 sm:py-12">
      <header className="flex flex-col gap-2">
        <Link href="/" className="w-fit text-sm text-ink-soft underline-offset-4 hover:text-accent hover:underline">
          ← All tools
        </Link>
        <h1 className="font-display text-3xl font-medium tracking-tight text-ink sm:text-4xl">{tool.name}</h1>
        <p className="max-w-prose text-ink-mid">{tool.blurb}</p>
      </header>
      <Workspace />
    </main>
  );
}
