import React from "react";
import type { DesktopTopBarProps } from "../types.ts";
import TopDock from "../../components/navigation/TopDock.tsx";

export default function ChubDesktopTopBar(props: DesktopTopBarProps) {
  return (
    <div className="shrink-0 border-b border-black/10 bg-[linear-gradient(180deg,rgba(20,17,15,0.98),rgba(28,23,20,0.95))] px-5 py-3">
      <TopDock {...props} variant="chub" density="regular" />
    </div>
  );
}
