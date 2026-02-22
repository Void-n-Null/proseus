import React from "react";
import type { ChatHeaderLayoutProps } from "../../components/chat/chat-header/types.ts";
import { Avatar } from "../../components/ui/avatar.tsx";

export default function ChubHeader({
  chatName,
  isMobile,
  onBack,
  characterName,
  characterAvatarUrl,
  characterColor,
  isExporting,
  exportMenuOpen,
  setExportMenuOpen,
  exportMenuRef,
  onExport,
}: ChatHeaderLayoutProps) {
  const displayName = characterName ?? chatName;

  return (
    <div className="shrink-0 px-3 py-2 flex items-center">
      {/* Left: back button */}
      <div className="w-10 flex items-center justify-start">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="w-9 h-9 flex items-center justify-center rounded-full text-text-muted hover:text-text-body hover:bg-surface-hover transition-colors"
            aria-label="Back"
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
              <path d="M12.5 15L7.5 10L12.5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </div>

      {/* Center: avatar + character name */}
      <div className="flex-1 flex items-center justify-center gap-2 min-w-0">
        {characterAvatarUrl ? (
          <Avatar
            src={characterAvatarUrl}
            alt={displayName}
            size={26}
            fit="cover"
            borderRadius="50%"
          />
        ) : (
          <div
            className="w-[26px] h-[26px] rounded-full flex items-center justify-center text-[0.7rem] font-semibold text-white shrink-0"
            style={{ background: characterColor ?? "#666" /* intentionally dynamic */ }}
          >
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}
        <span className="text-sm font-medium text-text-body truncate">
          {displayName}
        </span>
      </div>

      {/* Right: export button */}
      <div className="w-10 flex items-center justify-end" ref={exportMenuRef}>
        <button
          type="button"
          disabled={isExporting}
          onClick={() => setExportMenuOpen((open) => !open)}
          className="w-9 h-9 flex items-center justify-center rounded-full text-text-muted hover:text-text-body hover:bg-surface-hover transition-colors disabled:opacity-50 disabled:cursor-wait"
          aria-label={isExporting ? "Exporting..." : "Export"}
        >
          {isExporting ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          )}
        </button>

        {exportMenuOpen && (
          <div className="absolute right-3 top-[calc(100%)] min-w-[12.5rem] bg-surface border border-border rounded-md shadow-lg z-20 p-1">
            <button
              type="button"
              onClick={() => onExport("chat")}
              className="w-full text-left px-2 py-1.5 text-xs text-text-muted hover:text-text-body hover:bg-surface-raised rounded"
            >
              Proseus archive (.chat)
            </button>
            <button
              type="button"
              onClick={() => onExport("jsonl")}
              className="w-full text-left px-2 py-1.5 text-xs text-text-muted hover:text-text-body hover:bg-surface-raised rounded"
            >
              JSONL (SillyTavern)
            </button>
            <button
              type="button"
              onClick={() => onExport("txt")}
              className="w-full text-left px-2 py-1.5 text-xs text-text-muted hover:text-text-body hover:bg-surface-raised rounded"
            >
              Text transcript (.txt)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
