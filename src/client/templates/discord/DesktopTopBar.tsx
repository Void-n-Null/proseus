import React from "react";
import type { DesktopTopBarProps } from "../types.ts";
import TopDock from "../../components/navigation/TopDock.tsx";

export default function DiscordDesktopTopBar(props: DesktopTopBarProps) {
  return (
    <div className="h-full flex items-center justify-between gap-3 px-3 border-b border-white/6 bg-[linear-gradient(180deg,rgba(20,21,24,0.96),rgba(18,19,22,0.92))]">
      <TopDock {...props} variant="discord" density="compact" />
    </div>
  );
}
