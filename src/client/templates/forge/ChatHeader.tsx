import React, { useEffect, useRef, useState } from "react";
import type { ChatHeaderLayoutProps } from "../../components/chat/chat-header/types.ts";
import { DESIGN_TEMPLATES, type DesignTemplateId } from "../../../shared/design-templates.ts";

export default function ForgeChatHeader({
  chatName,
  isMobile,
  onBack,
  isExporting,
  onExport,
  onOpenModelDashboard,
  designTemplateId,
  onSelectDesignTemplate,
}: ChatHeaderLayoutProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [themeSubmenuOpen, setThemeSubmenuOpen] = useState(false);
  const [exportSubmenuOpen, setExportSubmenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;

    const onMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!menuRef.current?.contains(target)) {
        setMenuOpen(false);
        setThemeSubmenuOpen(false);
        setExportSubmenuOpen(false);
      }
    };

    window.addEventListener("mousedown", onMouseDown);
    return () => window.removeEventListener("mousedown", onMouseDown);
  }, [menuOpen]);

  const closeAll = () => {
    setMenuOpen(false);
    setThemeSubmenuOpen(false);
    setExportSubmenuOpen(false);
  };

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

      {/* Hamburger menu */}
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => {
            setMenuOpen((o) => !o);
            if (menuOpen) {
              setThemeSubmenuOpen(false);
              setExportSubmenuOpen(false);
            }
          }}
          className="px-2 py-1.5 text-xs bg-surface-raised text-text-muted border border-border rounded-md hover:text-text-body transition-colors"
          aria-label="Menu"
        >
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
            <path d="M4 6h12M4 10h12M4 14h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-[calc(100%+0.35rem)] min-w-[13rem] bg-surface border border-border rounded-md shadow-lg z-20 p-1">
            {/* Switch Theme */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setThemeSubmenuOpen((o) => !o);
                  setExportSubmenuOpen(false);
                }}
                className="w-full text-left px-2 py-1.5 text-xs text-text-muted hover:text-text-body hover:bg-surface-raised rounded flex items-center justify-between"
              >
                <span className="flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="5" />
                    <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                    <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                  </svg>
                  Switch Theme
                </span>
                <svg width="12" height="12" viewBox="0 0 20 20" fill="none">
                  <path d="M12.5 5L7.5 10L12.5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {themeSubmenuOpen && (
                <div className="absolute right-full top-0 mr-1 min-w-[10rem] bg-surface border border-border rounded-md shadow-lg z-30 p-1">
                  {Object.values(DESIGN_TEMPLATES).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        onSelectDesignTemplate(t.id as DesignTemplateId);
                        closeAll();
                      }}
                      className={`w-full text-left px-2 py-1.5 text-xs rounded flex items-center gap-2 ${
                        t.id === designTemplateId
                          ? "text-text-body bg-surface-raised"
                          : "text-text-muted hover:text-text-body hover:bg-surface-raised"
                      }`}
                    >
                      {t.id === designTemplateId && (
                        <svg width="12" height="12" viewBox="0 0 20 20" fill="none">
                          <path d="M4 10l4 4L16 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                      <span className={t.id === designTemplateId ? "" : "ml-[20px]"}>{t.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Change Model */}
            <button
              type="button"
              onClick={() => {
                onOpenModelDashboard();
                closeAll();
              }}
              className="w-full text-left px-2 py-1.5 text-xs text-text-muted hover:text-text-body hover:bg-surface-raised rounded flex items-center gap-2"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
              Change Model
            </button>

            {/* Divider */}
            <div className="my-1 border-t border-border" />

            {/* Export Chat */}
            <div className="relative">
              <button
                type="button"
                disabled={isExporting}
                onClick={() => {
                  setExportSubmenuOpen((o) => !o);
                  setThemeSubmenuOpen(false);
                }}
                className="w-full text-left px-2 py-1.5 text-xs text-text-muted hover:text-text-body hover:bg-surface-raised rounded flex items-center justify-between disabled:opacity-50 disabled:cursor-wait"
              >
                <span className="flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  {isExporting ? "Exporting..." : "Export Chat"}
                </span>
                <svg width="12" height="12" viewBox="0 0 20 20" fill="none">
                  <path d="M12.5 5L7.5 10L12.5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {exportSubmenuOpen && (
                <div className="absolute right-full top-0 mr-1 min-w-[11rem] bg-surface border border-border rounded-md shadow-lg z-30 p-1">
                  <button type="button" onClick={() => { onExport("chat"); closeAll(); }} className="w-full text-left px-2 py-1.5 text-xs text-text-muted hover:text-text-body hover:bg-surface-raised rounded">
                    Proseus archive (.chat)
                  </button>
                  <button type="button" onClick={() => { onExport("jsonl"); closeAll(); }} className="w-full text-left px-2 py-1.5 text-xs text-text-muted hover:text-text-body hover:bg-surface-raised rounded">
                    JSONL (SillyTavern)
                  </button>
                  <button type="button" onClick={() => { onExport("txt"); closeAll(); }} className="w-full text-left px-2 py-1.5 text-xs text-text-muted hover:text-text-body hover:bg-surface-raised rounded">
                    Text transcript (.txt)
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
