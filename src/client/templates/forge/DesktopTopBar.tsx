import React from "react";
import type { DesktopTopBarProps } from "../types.ts";
import TopDock from "../../components/navigation/TopDock.tsx";

export default function ForgeDesktopTopBar(props: DesktopTopBarProps) {
  return (
    <div className="shrink-0 border-b border-border bg-[linear-gradient(180deg,color-mix(in_oklab,var(--color-surface)_78%,transparent),color-mix(in_oklab,var(--color-background)_96%,black))] px-4 py-3">
      <TopDock {...props} variant="default" density="regular" />
    </div>
  );
}
