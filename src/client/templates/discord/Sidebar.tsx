import React, { useCallback, useRef, useState } from "react";
import type { SidebarLayoutProps } from "../types.ts";
import { useDesignTemplateId } from "../../hooks/useDesignTemplate.ts";
import { setStoredDesignTemplateId, applyDesignTemplate } from "../../lib/design-templates.ts";
import { DESIGN_TEMPLATES, type DesignTemplateId } from "../../../shared/design-templates.ts";
import { api } from "../../api/client.ts";
import { getFilenameFromDisposition, triggerDownload } from "../../lib/download.ts";
import ModelDashboard from "../../components/model/ModelDashboard.tsx";
import PromptTemplateModal from "../../components/prompt-template/PromptTemplateModal.tsx";
import DiscordDMList from "./DMList.tsx";
import SidebarTopBar from "./SidebarTopBar.tsx";
import { LucideBubbles } from "lucide-react";

/**
 * Discord sidebar layout.
 *
 * Top section: four Discord-style nav rows (Settings, Theme, Change Model, Export).
 * Middle section: "Direct Messages" header + DM chat list.
 * Characters/Personas views fall back to the shared render-prop sub-components.
 */
export default function DiscordSidebar({
  view,
  setView,
  chatCount,
  activeChatId,
  onChatCreated,
  onSelectChat,
  renderCharacters,
  renderPersonas,
}: SidebarLayoutProps) {
  // ── Theme switching ──
  const designTemplateId = useDesignTemplateId();
  const [themeOpen, setThemeOpen] = useState(false);
  const themeRef = useRef<HTMLDivElement | null>(null);

  const selectTheme = useCallback((id: DesignTemplateId) => {
    setStoredDesignTemplateId(id);
    applyDesignTemplate(id);
    setThemeOpen(false);
  }, []);

  // ── Model dashboard ──
  const [modelOpen, setModelOpen] = useState(false);

  // ── Prompt template ──
  const [promptOpen, setPromptOpen] = useState(false);

  // ── Export ──
  const [isExporting, setIsExporting] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement | null>(null);

  const handleExport = useCallback(
    async (format: "chat" | "jsonl" | "txt") => {
      if (!activeChatId) return;
      setIsExporting(true);
      setExportOpen(false);
      try {
        const fetcher =
          format === "chat"
            ? api.chats.exportChat
            : format === "jsonl"
              ? api.chats.exportJsonl
              : api.chats.exportTxt;
        const ext = format === "chat" ? ".chat" : format === "jsonl" ? ".jsonl" : ".txt";
        const fallback = `export-${Date.now()}${ext}`;
        const { blob, contentDisposition } = await fetcher(activeChatId);
        triggerDownload(blob, getFilenameFromDisposition(contentDisposition, fallback));
      } finally {
        setIsExporting(false);
      }
    },
    [activeChatId],
  );

  // ── If we're on Characters or Personas, show those with the top bar ──
  if (view !== "chats") {
    const topBar = <SidebarTopBar view={view} setView={setView} />;

    return (
      <>
        {view === "characters"
          ? renderCharacters(topBar)
          : renderPersonas(topBar)}
      </>
    );
  }

  // ── Chats view: Discord-style nav + DM list ──
  return (
    <div
      className="w-full sm:w-[240px] sm:min-w-[260px] h-full flex flex-col relative z-20"
      style={{
        background: "var(--color-surface)",
        fontFamily: "var(--discord-font, 'Noto Sans', sans-serif)",
      }}
    >
      <SidebarTopBar view={view} setView={setView} />

      {/* ── Sidebar body: static nav rows + scrollable DM list ── */}
      <div className="flex-1 min-h-0 flex flex-col">
        {/* Nav rows */}
        <div className="flex flex-col px-2 pt-3 pb-1 gap-[2px]">
          {/* Settings → Prompt template config */}
          <NavRow
            icon={<LucideBubbles />}
            label="Prompt"
            onClick={() => setPromptOpen(true)}
          />

          {/* Theme → submenu */}
          <div className="relative" ref={themeRef}>
            <NavRow
              icon={<ThemeIcon />}
              label="Theme"
              active={themeOpen}
              onClick={() => setThemeOpen((o) => !o)}
            />
            {themeOpen && (
              <div className="absolute left-full top-0 ml-1 min-w-[10rem] bg-[#111214] border border-[#1f2023] rounded-md shadow-[0_8px_24px_rgba(0,0,0,0.6)] z-30 p-1">
                {Object.values(DESIGN_TEMPLATES).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => selectTheme(t.id as DesignTemplateId)}
                    className={`w-full text-left px-2 py-1.5 text-xs rounded-sm transition-colors flex items-center gap-2 ${
                      t.id === designTemplateId
                        ? "text-white bg-[#5865F2]"
                        : "text-[#b5bac1] hover:text-white hover:bg-[#5865F2]"
                    }`}
                  >
                    {t.id === designTemplateId && <CheckIcon />}
                    <span className={t.id === designTemplateId ? "" : "ml-[20px]"}>{t.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Change Model */}
          <NavRow
            icon={<ModelIcon />}
            label="Change Model"
            onClick={() => setModelOpen(true)}
          />

          {/* Export → submenu */}
          <div className="relative" ref={exportRef}>
            <NavRow
              icon={<ExportIcon />}
              label={isExporting ? "Exporting..." : "Export"}
              active={exportOpen}
              disabled={!activeChatId || isExporting}
              onClick={() => setExportOpen((o) => !o)}
            />
            {exportOpen && activeChatId && (
              <div className="absolute left-full top-0 ml-1 min-w-[11rem] bg-[#111214] border border-[#1f2023] rounded-md shadow-[0_8px_24px_rgba(0,0,0,0.6)] z-30 p-1">
                <button type="button" onClick={() => void handleExport("chat")} className="w-full text-left px-2 py-1.5 text-xs text-[#b5bac1] hover:text-white hover:bg-[#5865F2] rounded-sm transition-colors">
                  Proseus archive (.chat)
                </button>
                <button type="button" onClick={() => void handleExport("jsonl")} className="w-full text-left px-2 py-1.5 text-xs text-[#b5bac1] hover:text-white hover:bg-[#5865F2] rounded-sm transition-colors">
                  JSONL (SillyTavern)
                </button>
                <button type="button" onClick={() => void handleExport("txt")} className="w-full text-left px-2 py-1.5 text-xs text-[#b5bac1] hover:text-white hover:bg-[#5865F2] rounded-sm transition-colors">
                  Text transcript (.txt)
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Separator */}
        <div className="mx-2 my-1 border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }} />

        {/* DM list */}
        <div className="flex-1 min-h-0 overflow-y-auto">
        <DiscordDMList
          activeChatId={activeChatId}
          onSelectChat={onSelectChat}
          onChatCreated={onChatCreated}
        />
        </div>
      </div>

      {/* Model dashboard modal (portable — rendered here, opens on demand) */}
      <ModelDashboard open={modelOpen} onOpenChange={setModelOpen} />

      {/* Prompt template modal (portable — same pattern as ModelDashboard) */}
      <PromptTemplateModal open={promptOpen} onOpenChange={setPromptOpen} chatId={activeChatId} />
    </div>
  );
}

// ─── Nav row ────────────────────────────────────────────────────────────────

function NavRow({
  icon,
  label,
  active,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex items-center gap-3 px-2 py-[7px] rounded-[4px] transition-colors w-full text-left ${
        active
          ? "bg-[rgba(255,255,255,0.06)] text-[#f2f3f5]"
          : "text-[#949ba4] hover:bg-[rgba(255,255,255,0.03)] hover:text-[#dbdee1]"
      } disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      <span className="shrink-0 w-6 h-6 flex items-center justify-center">{icon}</span>
      <span className="text-[0.9rem] font-medium truncate">{label}</span>
    </button>
  );
}

// ─── Icons ──────────────────────────────────────────────────────────────────

function SettingsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function ThemeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function ModelIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

function ExportIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 20 20" fill="none">
      <path d="M4 10l4 4L16 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
