import React, { useEffect, useRef, useState } from "react";
import type { ChatHeaderLayoutProps } from "../../components/chat/chat-header/types.ts";
import { Avatar } from "../../components/ui/avatar.tsx";
import { ChevronLeft, PencilIcon, PenIcon, PenLineIcon } from "lucide-react";
import { MenuIcon } from "lucide-react";
import TemplatePickerModal from "../../components/design-template/TemplatePicker.tsx";

export default function ChubHeader({
  chatName,
  isMobile,
  onBack,
  characterName,
  characterAvatarUrl,
  isExporting,
  onExport,
  onOpenModelDashboard,
  onOpenPromptTemplate,
  designTemplateId,
  onSelectDesignTemplate,
}: ChatHeaderLayoutProps) {
  const displayName = characterName ?? chatName;

  const [menuOpen, setMenuOpen] = useState(false);
  const [exportSubmenuOpen, setExportSubmenuOpen] = useState(false);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;

    const onMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!menuRef.current?.contains(target)) {
        setMenuOpen(false);
        setExportSubmenuOpen(false);
      }
    };

    window.addEventListener("mousedown", onMouseDown);
    return () => window.removeEventListener("mousedown", onMouseDown);
  }, [menuOpen]);

  const closeAll = () => {
    setMenuOpen(false);
    setExportSubmenuOpen(false);
  };

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
        <PenLineIcon width="16" height="16" className="text-text-body" />
      </div>

      {/* Right: hamburger menu */}
      <div className="w-14 flex items-center justify-end">
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => {
              setMenuOpen((o) => !o);
              if (menuOpen) {
                setExportSubmenuOpen(false);
              }
            }}
            className="w-12 pl-2 h-12 !min-h-0 !min-w-0 flex items-center justify-center rounded-lg text-text-muted hover:text-text-body hover:bg-white/10 transition-colors"
            aria-label="Menu"
          >
            <MenuIcon width="22" height="22" className="text-text-body" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-[calc(100%)] min-w-[13rem] bg-surface border border-border rounded-md shadow-lg z-20 p-1">
              <button
                type="button"
                onClick={() => {
                  setTemplatePickerOpen(true);
                  closeAll();
                }}
                className="w-full text-left px-2 py-1.5 text-xs text-text-muted hover:text-text-body hover:bg-surface-raised rounded flex items-center gap-2"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
                Themes
              </button>

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

              {/* Edit Prompt */}
              <button
                type="button"
                onClick={() => {
                  onOpenPromptTemplate?.();
                  closeAll();
                }}
                className="w-full text-left px-2 py-1.5 text-xs text-text-muted hover:text-text-body hover:bg-surface-raised rounded flex items-center gap-2"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
                Edit Prompt
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
      <TemplatePickerModal
        open={templatePickerOpen}
        onOpenChange={setTemplatePickerOpen}
        activeId={designTemplateId}
        onSelect={onSelectDesignTemplate}
      />
    </div>
  );
}
