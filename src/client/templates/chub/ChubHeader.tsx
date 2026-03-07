import React from "react";
import type { ChatHeaderLayoutProps } from "../../components/chat/chat-header/types.ts";
import { Avatar } from "../../components/ui/avatar.tsx";
import { ChevronLeft } from "lucide-react";

export default function ChubHeader({
  chatName,
  onBack,
  topDockHidden,
  onShowTopDock,
  characterName,
  characterAvatarUrl,
}: ChatHeaderLayoutProps) {
  const displayName = characterName ?? chatName;

  return (
    <div className="shrink-0 h-[42px] px-3 flex items-center md:w-[59vw] w-full mx-auto">
      {/* Left: back button */}
      <div className="w-14 flex items-center justify-start ">
          <button
            type="button"
            onClick={onBack}
            className="!min-h-0 !min-w-0 flex items-center justify-center rounded-lg hover:bg-white/5 transition-colors px-4 py-2.5 pl-3"
            aria-label="Back"
          >
            <div className="w-[18px] h-[18px] flex items-center justify-center bg-[rgb(242,228,214)] text-text-muted hover:text-text-body rounded-full ">
            <ChevronLeft width="18" height="18" className="text-[#2e2e2e] pr-0.5" />
            </div>
          </button>
      </div>

      {/* Center: avatar + character name */}
      <div className="flex-1 flex items-center justify-center gap-2">
        {characterAvatarUrl ? (
          <Avatar
            src={characterAvatarUrl}
            alt={displayName}
            size={30}
            fit="natural"
            borderRadius="40%"
            className="max-h-[30px] "
          />
        ) : (
          <div
            className="w-[26px] h-[26px] rounded-full flex items-center justify-center text-[1rem] font-extralight shrink-0"

          >
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}
        <span
          className="text-[1rem] text-text-body truncate"

        >
          {displayName}
        </span>
      </div>
      <div className="w-20 flex items-center justify-end">
        {topDockHidden && onShowTopDock && (
          <button
            type="button"
            onClick={onShowTopDock}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-[rgba(255,245,232,0.06)] text-[rgba(229,213,197,0.78)] transition-colors hover:text-white"
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
