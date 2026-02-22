import React from "react";
import type { ChatHeaderLayoutProps } from "../../components/chat/chat-header/types.ts";
import ModelSelector from "../../components/model/ModelSelector.tsx";

export default function ForgeChatHeader({
  chatName,
  isMobile,
  onBack,
  isExporting,
  exportMenuOpen,
  setExportMenuOpen,
  exportMenuRef,
  onExport,
}: ChatHeaderLayoutProps) {
  return (
    <div className="shrink-0 border-b border-border bg-surface/40 px-3 py-2 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {isMobile && onBack && (
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

      {isMobile ? (
        <ModelSelector className="w-[min(42vw,150px)] max-w-[150px] h-11" />
      ) : (
        <div className="relative" ref={exportMenuRef}>
          <button
            type="button"
            disabled={isExporting}
            onClick={() => setExportMenuOpen((open) => !open)}
            className="px-3 py-1.5 text-xs bg-surface-raised text-text-muted border border-border rounded-md hover:text-text-body transition-colors disabled:opacity-50 disabled:cursor-wait"
          >
            {isExporting ? "Exporting..." : "Export"}
          </button>

          {exportMenuOpen && (
            <div className="absolute right-0 top-[calc(100%+0.35rem)] min-w-[12.5rem] bg-surface border border-border rounded-md shadow-lg z-20 p-1">
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
      )}
    </div>
  );
}
