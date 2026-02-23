import React, { useEffect, useRef, useState } from "react";
import type { ChatHeaderLayoutProps } from "../../components/chat/chat-header/types.ts";
import { Avatar } from "../../components/ui/avatar.tsx";
import { ChevronLeft } from "lucide-react";

export default function ChubHeader({
  chatName,
  isMobile,
  onBack,
  showAppShellHeader,
  onToggleAppShellHeader,
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
  const [optionsMenuOpen, setOptionsMenuOpen] = useState(false);
  const optionsMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!optionsMenuOpen) return;

    const onMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!optionsMenuRef.current?.contains(target)) {
        setOptionsMenuOpen(false);
      }
    };

    window.addEventListener("mousedown", onMouseDown);
    return () => window.removeEventListener("mousedown", onMouseDown);
  }, [optionsMenuOpen]);

  const canToggleShellHeader = !isMobile && !!onToggleAppShellHeader;

  return (
    <div className="shrink-0 h-[42px] px-3 flex items-center md:w-[60vw] w-full mx-auto">
      {/* Left: back button */}
      <div className="w-14 flex items-center justify-start">
        
          <button
            type="button"
            onClick={onBack}
            className="!min-h-0 !min-w-0 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors px-3 py-2"
            aria-label="Back"
          >
            <div className="w-[16px] h-[16px] flex items-center justify-center bg-[rgb(242,228,214)]/85 text-text-muted hover:text-text-body rounded-full">
            <ChevronLeft width="12" height="12" className="text-[var(--color-background)]" />
            </div>
          </button>

      </div>

      {/* Center: avatar + character name */}
      <div className="flex-1 flex items-center justify-center gap-2">
        {characterAvatarUrl ? (
          <Avatar
            src={characterAvatarUrl}
            alt={displayName}
            size={32}
            fit="natural"
            borderRadius="40%"
          />
        ) : (
          <div
            className="w-[26px] h-[26px] rounded-full flex items-center justify-center text-[1rem] font-medium shrink-0"
            style={{
              fontFamily: "var(--chub-font)",
            }}
          >
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}
        <span
          className="text-[1rem] text-text-body truncate"
          style={{ fontFamily: "var(--chub-font)" }}
        >
          {displayName}
        </span>
      </div>

      {/* Right: export + options */}
      <div className="w-20 flex items-center justify-end gap-1.5">
        <div className="relative" ref={exportMenuRef}>
          <button
            type="button"
            disabled={isExporting}
            onClick={() => setExportMenuOpen((open) => !open)}
            className="w-9 h-9 !min-h-0 !min-w-0 flex items-center justify-center rounded-full text-text-muted hover:text-text-body hover:bg-surface-hover transition-colors disabled:opacity-50 disabled:cursor-wait"
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
            <div className="absolute right-0 top-[calc(100%)] min-w-[12.5rem] bg-surface border border-border rounded-md shadow-lg z-20 p-1">
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

        {canToggleShellHeader && (
          <div className="relative" ref={optionsMenuRef}>
            <button
              type="button"
              onClick={() => setOptionsMenuOpen((open) => !open)}
              className="w-9 h-9 !min-h-0 !min-w-0 flex items-center justify-center rounded-full text-text-muted hover:text-text-body hover:bg-surface-hover transition-colors"
              aria-label="Chat options"
            >
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                <path d="M4 6h12M4 10h12M4 14h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>

            {optionsMenuOpen && (
              <div className="absolute right-0 top-[calc(100%)] min-w-[12.5rem] bg-surface border border-border rounded-md shadow-lg z-20 p-1">
                <button
                  type="button"
                  onClick={() => {
                    onToggleAppShellHeader?.();
                    setOptionsMenuOpen(false);
                  }}
                  className="w-full text-left px-2 py-1.5 text-xs text-text-muted hover:text-text-body hover:bg-surface-raised rounded"
                >
                  {showAppShellHeader ? "Hide app shell header" : "Show app shell header"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
