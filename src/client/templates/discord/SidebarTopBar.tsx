import React from "react";
import type { SidebarView } from "../types.ts";

/**
 * Discord sidebar top bar — view switcher.
 *
 * Sits at the same h-12 as the ChatHeader so the two bars align horizontally.
 * Uses the sidebar bg (#2b2d31) so the sidebar border/color runs continuously
 * from top to bottom. Contains a recessed pill with Characters / Personas / Chats
 * buttons, replacing Discord's "Find or start a conversation" input.
 */
export default function SidebarTopBar({
  view,
  setView,
}: {
  view: SidebarView;
  setView: (view: SidebarView) => void;
}) {
  return (
    <div className="shrink-0 h-12 px-2 flex items-center" style={{ borderBottom: "1px solid #404040" }}>
      <div className="flex w-full h-[28px] rounded bg-[#1e1f22] overflow-hidden">
        <TopBarButton
          label="Characters"
          active={view === "characters"}
          onClick={() => setView("characters")}
        />
        <TopBarButton
          label="Personas"
          active={view === "personas"}
          onClick={() => setView("personas")}
        />
        <TopBarButton
          label="Chats"
          active={view === "chats"}
          onClick={() => setView("chats")}
        />
      </div>
    </div>
  );
}

function TopBarButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  if (active) {
    return (
      <button
        type="button"
        className="flex-1 text-[0.72rem] font-medium text-[#f2f3f5] bg-[rgba(255,255,255,0.06)] cursor-default"
      >
        {label}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 text-[0.72rem] font-medium text-[#949ba4] hover:text-[#dbdee1] hover:bg-[rgba(255,255,255,0.04)] transition-colors"
    >
      {label}
    </button>
  );
}
