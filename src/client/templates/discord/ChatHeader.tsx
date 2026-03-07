import React from "react";
import type { ChatHeaderLayoutProps } from "../../components/chat/chat-header/types.ts";
import { Avatar } from "../../components/ui/avatar.tsx";

/**
 * Discord-style chat header.
 *
 * Emulates the DM / channel header bar: avatar with online indicator on the
 * left, character name in bold, toolbar icons + search on the right.
 */
export default function DiscordChatHeader({
  chatName,
  isMobile,
  onBack,
  topDockHidden,
  onShowTopDock,
  characterName,
  characterAvatarUrl,
  characterColor,
}: ChatHeaderLayoutProps) {
  const displayName = characterName ?? chatName;

  /* ---- shared icon-button style ---- */
  const iconBtn =
    "shrink-0 w-8 h-8 flex items-center justify-center rounded text-[#b5bac1] hover:text-[#dbdee1] transition-colors";

  return (
    <div className="shrink-0 h-12 border-b border-[rgba(255,255,255,0.075)] bg-[#1a1a1e] px-3 flex items-center gap-2" style={{ fontFamily: "var(--discord-font)" }}>
      {/* -- Left: back (mobile) + avatar + name -- */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {isMobile && onBack && (
          <button
            type="button"
            onClick={onBack}
            className={`${iconBtn} -ml-1`}
            aria-label="Back to sidebar"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        )}

        {/* Avatar with online dot */}
        <div className="relative shrink-0">
          {characterAvatarUrl ? (
            <Avatar
              src={characterAvatarUrl}
              alt={displayName}
              size={24}
              borderRadius="50%"
            />
          ) : (
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-[0.65rem] font-semibold text-white"
              style={{ background: characterColor ?? "#5865F2" }}
            >
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}
          {/* Online indicator */}
          <span className="absolute -bottom-[1px] -right-[1px] w-[10px] h-[10px] rounded-full bg-[#23a559] border-[2.5px] border-[#2b2d31]" />
        </div>

        <span className="text-[0.94rem] font-semibold text-[#f2f3f5] truncate leading-none">
          {displayName}
        </span>
      </div>

      {/* -- Right: toolbar icons -- */}
      <div className="flex items-center gap-0.5">
        {/* Search -- decorative input matching Discord's recessed style */}
        {!isMobile && (
          <div className="ml-1 flex items-center h-[26px] w-[240px] rounded bg-[oklch(0.18_0.007_300)] px-1.5 text-[0.7rem] text-[#949ba4] select-none cursor-text">
            <span className="flex-1 truncate">Search</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 ml-1 text-[#949ba4]">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </div>
        )}
        {topDockHidden && onShowTopDock && (
          <button
            type="button"
            onClick={onShowTopDock}
            className={`${iconBtn} border border-[#2b2d31] bg-[#23252a] px-2.5`}
            aria-label="Open dock"
            title="Open dock"
          >
            <MenuIcon />
          </button>
        )}
      </div>
    </div>
  );
}

function MenuIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 7h16M4 12h16M4 17h16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
