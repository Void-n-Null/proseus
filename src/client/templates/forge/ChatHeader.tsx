import React from "react";
import type { ChatHeaderLayoutProps } from "../../components/chat/chat-header/types.ts";

export default function ForgeChatHeader({
  chatName,
  onBack,
  topDockHidden,
  onShowTopDock,
}: ChatHeaderLayoutProps) {
  return (
    <div className="shrink-0 border-b border-border bg-surface/40 px-3 py-2 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="shrink-0 w-11 h-11 flex items-center justify-center text-text-muted hover:text-text-body transition-colors -ml-1"
            aria-label="Back to sidebar"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M12.5 15L7.5 10L12.5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
        <div className="text-sm text-text-muted truncate" title={chatName}>
          {chatName}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {topDockHidden && onShowTopDock && (
          <button
            type="button"
            onClick={onShowTopDock}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-surface-raised text-text-muted transition-colors hover:text-text-body"
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
