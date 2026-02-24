import React from "react";
import type { SidebarLayoutProps } from "./types.ts";

/**
 * Default sidebar layout — used by Forge and Chub.
 *
 * Renders a pill-style tab bar at the top (Characters / Personas / Chats)
 * and switches between the three panel render-props based on the active view.
 *
 * Templates that want a different tab style, ordering, or chrome around the
 * panels should create their own Sidebar component instead of using this one.
 * They can still call the same `renderCharacters` / `renderPersonas` /
 * `renderChats` render props to avoid reimplementing the panel contents.
 */
export default function DefaultSidebar({
  view,
  setView,
  chatCount,
  renderCharacters,
  renderPersonas,
  renderChats,
}: SidebarLayoutProps) {
  const tabs = (
    <div className="flex gap-[2px] bg-surface-raised rounded-md p-[2px]">
      <TabButton active={view === "characters"} onClick={() => setView("characters")} label="Characters" />
      <TabButton active={view === "personas"} onClick={() => setView("personas")} label="Personas" />
      <TabButton
        active={view === "chats"}
        onClick={() => setView("chats")}
        label={`Chats${chatCount > 0 ? ` (${chatCount})` : ""}`}
      />
    </div>
  );

  return (
    <>
      {view === "characters"
        ? renderCharacters(tabs)
        : view === "personas"
          ? renderPersonas(tabs)
          : renderChats(tabs)}
    </>
  );
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-[0.6rem] py-[0.3rem] border-none rounded-sm cursor-pointer text-[0.72rem] transition-all ${
        active
          ? "bg-surface-raised text-text-body font-normal"
          : "bg-transparent text-text-dim font-light"
      }`}
    >
      {label}
    </button>
  );
}
