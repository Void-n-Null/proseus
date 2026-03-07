import React from "react";
import type { SidebarLayoutProps } from "../types.ts";
import DiscordDMList from "./DMList.tsx";

/**
 * Discord sidebar layout.
 *
 * This rail is intentionally dedicated to direct messages. Characters and
 * personas are now opened from the shared top dock instead of being stuffed
 * into the sidebar itself.
 */
export default function DiscordSidebar({
  view,
  setView,
  activeChatId,
  onSelectChat,
  renderCharacters,
  renderPersonas,
}: SidebarLayoutProps) {
  if (view !== "chats") {
    return <>{view === "characters" ? renderCharacters() : renderPersonas()}</>;
  }

  return (
    <div
      className="w-full sm:w-[240px] sm:min-w-[260px] h-full flex flex-col relative z-20"
      style={{
        background: "var(--color-surface)",
        fontFamily: "var(--discord-font, 'Noto Sans', sans-serif)",
      }}
    >
      <div className="flex-1 min-h-0 overflow-y-auto pt-2">
        <DiscordDMList
          activeChatId={activeChatId}
          onSelectChat={onSelectChat}
          onStartNewChat={() => setView("characters")}
        />
      </div>
    </div>
  );
}
