"use client";

import { useState } from "react";
import { KeepMetadata } from "@/components/fields";
import ToolWorkspace from "@/components/ToolWorkspace";
import { removeBgParams } from "@/lib/params";
import { TOOL_BY_SLUG } from "@/lib/tools";

export default function RemoveBgTool() {
  const [keepMetadata, setKeepMetadata] = useState(false);
  return (
    <ToolWorkspace
      tool={TOOL_BY_SLUG["remove-bg"]}
      autoRun
      buildParams={() => removeBgParams({ keepMetadata })}
      options={
        <>
          <p className="text-sm text-ink-mid">
            Starts as soon as you choose an image. Works best on a clear subject: a person, a product, a pet.
            You get a PNG with a transparent background.
          </p>
          <KeepMetadata checked={keepMetadata} onChange={setKeepMetadata} />
        </>
      }
    />
  );
}
