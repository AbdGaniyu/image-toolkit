import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import Workspace from "@/components/workspace/Workspace";
import { getTool, TOOLS } from "@/lib/tools";

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

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex flex-1 flex-col">
        <h1 className="sr-only">Image Toolkit workspace</h1>
        <Workspace initialTool={tool.slug} />
      </main>
    </div>
  );
}
