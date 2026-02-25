import React, { useEffect, useRef, useState } from "react";
import type { ChatHeaderLayoutProps } from "../../components/chat/chat-header/types.ts";
import { DESIGN_TEMPLATES, type DesignTemplateId } from "../../../shared/design-templates.ts";
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
  characterName,
  characterAvatarUrl,
  characterColor,
  isExporting,
  onExport,
  onOpenModelDashboard,
  onOpenPromptTemplate,
  designTemplateId,
  onSelectDesignTemplate,
}: ChatHeaderLayoutProps) {
  const displayName = characterName ?? chatName;

  const [menuOpen, setMenuOpen] = useState(false);
  const [themeSubmenuOpen, setThemeSubmenuOpen] = useState(false);
  const [exportSubmenuOpen, setExportSubmenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (!(e.target instanceof Node)) return;
      if (!menuRef.current?.contains(e.target)) {
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

  /* ---- shared icon-button style ---- */
  const iconBtn =
    "shrink-0 w-8 h-8 flex items-center justify-center rounded text-[#b5bac1] hover:text-[#dbdee1] transition-colors";

  return (
    <div className="shrink-0 h-12 border-b border-[#404040] bg-[#1a1a1e] px-3 flex items-center gap-2" style={{ fontFamily: "var(--discord-font)" }}>
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
            className={iconBtn}
            aria-label="Menu"
            title="Menu"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-[calc(100%+4px)] min-w-[13rem] bg-[#111214] border border-[#1f2023] rounded-md shadow-[0_8px_24px_rgba(0,0,0,0.6)] z-20 p-1">
              {/* Switch Theme */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setThemeSubmenuOpen((o) => !o);
                    setExportSubmenuOpen(false);
                  }}
                  className="w-full text-left px-2 py-1.5 text-xs text-[#b5bac1] hover:text-white hover:bg-[#5865F2] rounded-sm transition-colors flex items-center justify-between"
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
                  <div className="absolute right-full top-0 mr-1 min-w-[10rem] bg-[#111214] border border-[#1f2023] rounded-md shadow-[0_8px_24px_rgba(0,0,0,0.6)] z-30 p-1">
                    {Object.values(DESIGN_TEMPLATES).map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          onSelectDesignTemplate(t.id as DesignTemplateId);
                          closeAll();
                        }}
                        className={`w-full text-left px-2 py-1.5 text-xs rounded-sm transition-colors flex items-center gap-2 ${
                          t.id === designTemplateId
                            ? "text-white bg-[#5865F2]"
                            : "text-[#b5bac1] hover:text-white hover:bg-[#5865F2]"
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
                className="w-full text-left px-2 py-1.5 text-xs text-[#b5bac1] hover:text-white hover:bg-[#5865F2] rounded-sm transition-colors flex items-center gap-2"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
                Change Model
              </button>

              {/* Edit Prompt */}
              <button
                type="button"
                onClick={() => {
                  onOpenPromptTemplate?.();
                  closeAll();
                }}
                className="w-full text-left px-2 py-1.5 text-xs text-[#b5bac1] hover:text-white hover:bg-[#5865F2] rounded-sm transition-colors flex items-center gap-2"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
                Edit Prompt
              </button>

              {/* Divider */}
              <div className="my-1 border-t border-[#1f2023]" />

              {/* Export Chat */}
              <div className="relative">
                <button
                  type="button"
                  disabled={isExporting}
                  onClick={() => {
                    setExportSubmenuOpen((o) => !o);
                    setThemeSubmenuOpen(false);
                  }}
                  className="w-full text-left px-2 py-1.5 text-xs text-[#b5bac1] hover:text-white hover:bg-[#5865F2] rounded-sm transition-colors flex items-center justify-between disabled:opacity-40 disabled:cursor-wait"
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
                  <div className="absolute right-full top-0 mr-1 min-w-[11rem] bg-[#111214] border border-[#1f2023] rounded-md shadow-[0_8px_24px_rgba(0,0,0,0.6)] z-30 p-1">
                    <button type="button" onClick={() => { onExport("chat"); closeAll(); }} className="w-full text-left px-2 py-1.5 text-xs text-[#b5bac1] hover:text-white hover:bg-[#5865F2] rounded-sm transition-colors">
                      Proseus archive (.chat)
                    </button>
                    <button type="button" onClick={() => { onExport("jsonl"); closeAll(); }} className="w-full text-left px-2 py-1.5 text-xs text-[#b5bac1] hover:text-white hover:bg-[#5865F2] rounded-sm transition-colors">
                      JSONL (SillyTavern)
                    </button>
                    <button type="button" onClick={() => { onExport("txt"); closeAll(); }} className="w-full text-left px-2 py-1.5 text-xs text-[#b5bac1] hover:text-white hover:bg-[#5865F2] rounded-sm transition-colors">
                      Text transcript (.txt)
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
