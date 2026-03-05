import React, { useState, useCallback, useRef, useEffect } from "react";
import type { SidebarLayoutProps } from "../types.ts";
import type { CharacterListItem } from "../../../shared/types.ts";
import { Avatar } from "../../components/ui/avatar.tsx";
import {
  useCharacters,
  useCharacter,
  useImportCharacter,
  useImportCharacterUrl,
  useCreateChatFromCharacter,
  useDeleteCharacter,
  useRecentChatForCharacter,
} from "../../hooks/useCharacters.ts";
import CharacterEditor from "../../components/characters/CharacterEditor.tsx";

// ─── Sidebar-variable rebind ─────────────────────────────────────────────────
// Locally override the generic --color-* tokens with the --sidebar-* tokens so
// that existing Tailwind classes (bg-surface, border-border, text-text-muted…)
// inside PersonaSidebar / ChatGallery resolve to the chub sidebar palette.
const SIDEBAR_VAR_REBIND: React.CSSProperties = {
  "--color-background": "var(--sidebar-bg)",
  "--color-surface": "var(--sidebar-surface)",
  "--color-surface-raised": "var(--sidebar-surface-raised)",
  "--color-surface-hover": "var(--sidebar-surface-hover)",
  "--color-border": "var(--sidebar-border)",
  "--color-text-body": "var(--sidebar-text-body)",
  "--color-text-muted": "var(--sidebar-text-muted)",
  "--color-text-dim": "var(--sidebar-text-dim)",
  "--color-primary": "var(--sidebar-primary)",
  "--color-destructive": "var(--sidebar-destructive)",
} as React.CSSProperties;

// ─── Shorthand helpers for var() references ──────────────────────────────────
const V = {
  bg: "rgba(16, 16, 16, 1)",
  surface: "var(--sidebar-surface)",
  surfaceRaised: "var(--sidebar-surface-raised)",
  surfaceHover: "var(--sidebar-surface-hover)",
  border: "var(--sidebar-border)",
  textBody: "var(--sidebar-text-body)",
  textMuted: "var(--sidebar-text-muted)",
  textDim: "var(--sidebar-text-dim)",
  primary: "var(--sidebar-primary)",
  destructive: "var(--sidebar-destructive)",
  tagBg: "var(--sidebar-tag-bg)",
  tagBorder: "var(--sidebar-tag-border)",
  tagText: "var(--sidebar-tag-text)",
  accent: "var(--sidebar-accent)",
} as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function relativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "now";
  const hrs = Math.floor(mins / 60);
  if (hrs < 1) return `${mins}m`;
  const days = Math.floor(hrs / 24);
  if (days < 1) return `${hrs}h`;
  const months = Math.floor(days / 30);
  if (months < 1) return `${days}d`;
  const years = Math.floor(days / 365);
  if (years >= 1) return `${years}y`;
  return `${months}mo`;
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

export default function ChubSidebar({
  view,
  setView,
  chatCount,
  renderPersonas,
  renderChats,
  onChatCreated,
}: SidebarLayoutProps) {
  const tabs = <ChubTabBar view={view} setView={setView} chatCount={chatCount} />;

  if (view !== "characters") {
    return (
      <div style={{ ...SIDEBAR_VAR_REBIND, display: "contents" }}>
        {view === "personas" ? renderPersonas(tabs) : renderChats(tabs)}
      </div>
    );
  }

  return <ChubCharacterPanel onChatCreated={onChatCreated} tabs={tabs} />;
}

// ─── Tab bar ─────────────────────────────────────────────────────────────────

function ChubTabBar({
  view,
  setView,
  chatCount,
}: {
  view: string;
  setView: (v: "characters" | "chats" | "personas") => void;
  chatCount: number;
}) {
  return (
    <div className="flex gap-[2px] rounded-md p-[2px]" style={{ background: V.surface }}>
      {(
        [
          ["characters", "Characters"],
          ["personas", "Personas"],
          ["chats", `Chats${chatCount > 0 ? ` (${chatCount})` : ""}`],
        ] as const
      ).map(([id, label]) => (
        <button
          key={id}
          onClick={() => setView(id as "characters" | "personas" | "chats")}
          className="px-[0.6rem] py-[0.3rem] border-none rounded-sm cursor-pointer text-[0.72rem] transition-all"
          style={{
            background: view === id ? V.surface : "transparent",
            color: view === id ? V.textBody : V.textDim,
            fontWeight: view === id ? 500 : 300,
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ─── Character panel (full import + list) ────────────────────────────────────

function ChubCharacterPanel({
  onChatCreated,
  tabs,
}: {
  onChatCreated: (chatId: string) => void;
  tabs: React.ReactNode;
}) {
  const { data, isLoading } = useCharacters();
  const importMutation = useImportCharacter();
  const importUrlMutation = useImportCharacterUrl();
  const createChatMutation = useCreateChatFromCharacter();
  const deleteMutation = useDeleteCharacter();

  const [dragOver, setDragOver] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [editingCharacterId, setEditingCharacterId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    text: string;
    type: "success" | "error" | "warn";
    action?: { label: string; onClick: () => void };
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showStatus = useCallback(
    (
      text: string,
      type: "success" | "error" | "warn",
      action?: { label: string; onClick: () => void },
    ) => {
      setStatusMessage({ text, type, action });
      if (!action) setTimeout(() => setStatusMessage(null), 4000);
    },
    [],
  );

  const handleFileImport = useCallback(
    async (files: FileList | null, force?: boolean) => {
      if (!files?.length) return;
      const file = files[0];
      if (!file) return;
      try {
        const result = await importMutation.mutateAsync({ file, force });
        if (result.duplicate) {
          showStatus(`"${result.character.name}" already exists.`, "warn", {
            label: "Import Anyway",
            onClick: () => {
              setStatusMessage(null);
              handleFileImport(files, true);
            },
          });
        } else {
          showStatus(`Imported "${result.character.name}"`, "success");
        }
      } catch (err) {
        showStatus(err instanceof Error ? err.message : "Import failed", "error");
      }
    },
    [importMutation, showStatus],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      handleFileImport(e.dataTransfer.files);
    },
    [handleFileImport],
  );

  const handleUrlImport = useCallback(async () => {
    if (!urlInput.trim()) return;
    try {
      const result = await importUrlMutation.mutateAsync(urlInput.trim());
      if (result.duplicate) {
        showStatus(`"${result.character.name}" already exists`, "error");
      } else {
        showStatus(`Imported "${result.character.name}"`, "success");
      }
      setUrlInput("");
      setShowUrlInput(false);
    } catch (err) {
      showStatus(err instanceof Error ? err.message : "URL import failed", "error");
    }
  }, [urlInput, importUrlMutation, showStatus]);

  const handleStartChat = useCallback(
    async (characterId: string) => {
      try {
        const result = await createChatMutation.mutateAsync(characterId);
        onChatCreated(result.chat.id);
      } catch (err) {
        showStatus(err instanceof Error ? err.message : "Failed to create chat", "error");
      }
    },
    [createChatMutation, onChatCreated, showStatus],
  );

  const handleContinueChat = useCallback(
    (chatId: string) => onChatCreated(chatId),
    [onChatCreated],
  );

  const handleDelete = useCallback(
    async (id: string, name: string) => {
      try {
        await deleteMutation.mutateAsync(id);
        showStatus(`Deleted "${name}"`, "success");
      } catch (err) {
        showStatus(err instanceof Error ? err.message : "Delete failed", "error");
      }
    },
    [deleteMutation, showStatus],
  );

  const characters = data?.characters ?? [];
  const isImporting = importMutation.isPending || importUrlMutation.isPending;
  const trimmedUrl = urlInput.trim();
  const canSubmitUrl = trimmedUrl.length > 0 && !importUrlMutation.isPending;
  const statusTone = statusMessage
    ? statusMessage.type === "success"
      ? {
          bg: "rgba(60,180,100,0.12)",
          border: "rgba(108,192,144,0.28)",
          text: "#6cc090",
          actionBg: "rgba(108,192,144,0.18)",
          actionText: "#8ad2a8",
        }
      : statusMessage.type === "warn"
        ? {
            bg: "rgba(200,160,50,0.12)",
            border: "rgba(212,176,96,0.28)",
            text: "#c8a050",
            actionBg: "rgba(212,176,96,0.2)",
            actionText: "#d4b060",
          }
        : {
            bg: "rgba(200,60,60,0.12)",
            border: "rgba(212,112,112,0.28)",
            text: "#c06060",
            actionBg: "rgba(212,112,112,0.18)",
            actionText: "#d48a8a",
          }
    : null;

  return (
    <div
      className="w-full sm:w-[600px] sm:min-w-[600px] h-full flex flex-col border-r"
      style={{ background: V.bg, borderColor: V.border }}
    >
      {creating && (
        <CharacterEditor character={null} onClose={() => setCreating(false)} onCreate={() => setCreating(false)} />
      )}
      {editingCharacterId && (
        <CharacterEditorLoader id={editingCharacterId} onClose={() => setEditingCharacterId(null)} />
      )}

      {/* Tab bar */}
      <div className="px-2 py-2 border-b" style={{ borderColor: V.border }}>
        {tabs}
      </div>

      {/* Header */}
      <div className="px-3 py-2.5 border-b flex flex-col gap-2.5" style={{ borderColor: V.border }}>
        <div className="flex items-center justify-between">
          <span className="text-[0.75rem] font-normal tracking-[0.12em] uppercase" style={{ color: V.textMuted }}>
            Characters
          </span>
          <span
            className="min-w-[1.75rem] h-[1.25rem] px-1.5 rounded-full text-[0.68rem] inline-flex items-center justify-center"
            style={{
              background: "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.01))",
              color: V.textDim,
              border: `1px solid ${V.border}`,
            }}
          >
            {characters.length}
          </span>
        </div>

        {/* Creation + import controls */}
        <div
          className="rounded-xl border p-[0.5rem] flex flex-col gap-[0.5rem]"
          style={{
            background: "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))",
            borderColor: V.border,
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
          }}
        >
          <div className="grid grid-cols-3 gap-[0.35rem]">
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="h-[2.05rem] px-[0.5rem] rounded-md border-none cursor-pointer text-[0.72rem] transition-all duration-200 flex items-center justify-center gap-1.5 text-white hover:-translate-y-[1px] hover:brightness-110 active:translate-y-0"
              style={{
                background: "linear-gradient(180deg, rgba(110,140,186,1), rgba(96,120,164,1))",
                boxShadow: "0 6px 16px rgba(96,120,164,0.32)",
              }}
            >
              <CreateIcon />
              <span>New</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
              className="h-[2.05rem] px-[0.5rem] rounded-md text-[0.72rem] transition-all duration-200 border cursor-pointer flex items-center justify-center gap-1.5 hover:-translate-y-[1px] hover:border-white/15 disabled:hover:translate-y-0"
              style={{
                background: V.surfaceRaised,
                color: V.tagText,
                borderColor: V.border,
                opacity: isImporting ? 0.55 : 1,
              }}
            >
              <FileImportIcon />
              <span>{isImporting ? "Importing" : "File"}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowUrlInput((prev) => !prev)}
              className="h-[2.05rem] px-[0.5rem] rounded-md cursor-pointer text-[0.72rem] transition-all duration-200 border flex items-center justify-center gap-1.5 hover:-translate-y-[1px]"
              style={{
                background: showUrlInput ? "rgba(96, 140, 220, 0.18)" : V.surfaceRaised,
                color: showUrlInput ? V.textBody : V.textMuted,
                borderColor: showUrlInput ? "rgba(96, 140, 220, 0.35)" : V.border,
                boxShadow: showUrlInput ? "0 0 0 1px rgba(96,140,220,0.12) inset" : "none",
              }}
            >
              <LinkImportIcon />
              <span>URL</span>
            </button>
          </div>

          {showUrlInput ? (
            <div
              className="rounded-lg border p-[0.4rem] flex flex-col gap-[0.35rem]"
              style={{
                background: "rgba(0,0,0,0.2)",
                borderColor: "rgba(96, 140, 220, 0.28)",
              }}
            >
              <div className="flex items-center justify-between px-1">
                <span className="text-[0.64rem] tracking-[0.08em] uppercase" style={{ color: "rgba(190, 210, 255, 0.85)" }}>
                  Import From URL
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setShowUrlInput(false);
                    setUrlInput("");
                  }}
                  className="w-5 h-5 rounded-sm border-none cursor-pointer flex items-center justify-center transition-colors duration-150"
                  style={{ color: V.textDim, background: "transparent" }}
                  aria-label="Close URL input"
                >
                  <CloseIcon />
                </button>
              </div>

              <div
                className="flex items-center gap-1.5 rounded-md border px-[0.45rem] py-[0.3rem]"
                style={{ background: V.bg, borderColor: V.border }}
              >
                <UrlInputIcon />
                <input
                  type="text"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleUrlImport();
                    if (e.key === "Escape") {
                      setShowUrlInput(false);
                      setUrlInput("");
                    }
                  }}
                  placeholder="https://chub.ai/characters/..."
                  className="flex-1 px-[0.1rem] py-[0.2rem] rounded-md text-[0.72rem] outline-none border-none"
                  style={{ background: "transparent", color: V.textBody }}
                  autoFocus
                />
                {urlInput.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setUrlInput("")}
                    className="w-5 h-5 rounded-sm border-none cursor-pointer flex items-center justify-center transition-colors duration-150"
                    style={{ color: V.textDim, background: "transparent" }}
                    aria-label="Clear URL"
                  >
                    <CloseIcon />
                  </button>
                )}
              </div>

              <div className="flex items-center justify-between gap-2 px-1">
                <span className="text-[0.64rem] leading-[1.35]" style={{ color: V.textDim }}>
                  Paste a direct Chub character link.
                </span>
                <button
                  type="button"
                  onClick={handleUrlImport}
                  disabled={!canSubmitUrl}
                  className="px-[0.65rem] py-[0.35rem] border-none rounded-md cursor-pointer text-[0.68rem] text-white transition-all duration-150"
                  style={{
                    background: "linear-gradient(180deg, rgba(110,140,186,1), rgba(96,120,164,1))",
                    opacity: canSubmitUrl ? 1 : 0.45,
                  }}
                >
                  {importUrlMutation.isPending ? "Importing" : "Import URL"}
                </button>
              </div>
            </div>
          ) : (
            <div className="px-1 text-[0.66rem] leading-[1.35]" style={{ color: V.textDim }}>
              Import PNG/JSON files or paste a Chub character URL.
            </div>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".png,.json"
          className="hidden"
          onChange={(e) => {
            handleFileImport(e.target.files);
            e.target.value = "";
          }}
        />

        {statusMessage && (
          <div
            className="px-[0.55rem] py-[0.38rem] rounded-md text-[0.72rem] flex items-center justify-between gap-[0.45rem] border"
            style={{
              background: statusTone?.bg,
              borderColor: statusTone?.border,
              color: statusTone?.text,
            }}
          >
            <span className="flex items-center gap-[0.35rem] min-w-0">
              <StatusDot />
              <span className="truncate">{statusMessage.text}</span>
            </span>
            {statusMessage.action && (
              <button
                type="button"
                onClick={statusMessage.action.onClick}
                className="px-[0.45rem] py-[0.2rem] border-none rounded-sm cursor-pointer text-[0.68rem] font-normal whitespace-nowrap"
                style={{ background: statusTone?.actionBg, color: statusTone?.actionText }}
              >
                {statusMessage.action.label}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Drop zone + character list */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className="flex-1 overflow-y-auto p-2 relative"
      >
        {dragOver && (
          <div
            className="absolute inset-2 border-2 border-dashed rounded-lg flex items-center justify-center z-10 pointer-events-none"
            style={{ borderColor: V.accent, background: "rgba(110,140,186,0.08)" }}
          >
            <span className="text-[0.85rem] font-normal" style={{ color: V.accent }}>
              Drop character card
            </span>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center h-full text-[0.8rem]" style={{ color: V.textDim }}>
            Loading...
          </div>
        ) : characters.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center p-4" style={{ color: V.textDim }}>
            <p className="text-[0.85rem]">No characters yet</p>
            <p className="text-[0.72rem] leading-[1.4]">
              Import a PNG character card or JSON file to get started. Drag and drop works too.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {characters.map((char) => (
              <ChubCharacterCard
                key={char.id}
                character={char}
                onStartChat={() => handleStartChat(char.id)}
                onContinueChat={handleContinueChat}
                onDelete={() => handleDelete(char.id, char.name)}
                onEdit={() => setEditingCharacterId(char.id)}
                isCreatingChat={createChatMutation.isPending}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Character card (Chub style) ─────────────────────────────────────────────

// Hardcoded colors matching the Chub.ai card UI
const C = {
  headerBg: "#001b2d",
  headerBorder: "transparent",
  cardBg: "rgba(36, 37, 37, 1)",
  cardBgHover: "rgba(41, 42, 42, 1)",
  statBarBg: "#001b2d",
  statText: "#b0b0c0",
  statIcon: "#c06070",
  descText: "#b8b8c8",
  tagChipBg: "#2a2a3a",
  tagChipBorder: "#3a3a4c",
  tagChipText: "#d2d2de",
  creatorText: "#e08050",
  ageText: "#808098",
  fireEmoji: "#e06030",
} as const;

function ChubCharacterCard({
  character,
  onStartChat,
  onContinueChat,
  onDelete,
  onEdit,
  isCreatingChat,
}: {
  character: CharacterListItem;
  onStartChat: () => void;
  onContinueChat: (chatId: string) => void;
  onDelete: () => void;
  onEdit: () => void;
  isCreatingChat: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const [showPopover, setShowPopover] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const { data: recentChatData } = useRecentChatForCharacter(character.id);
  const recentChat = recentChatData?.chat ?? null;

  useEffect(() => {
    if (!showPopover) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        setShowPopover(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowPopover(false);
    };
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [showPopover]);

  const handleClick = () => {
    if (showPopover || isCreatingChat) return;
    if (recentChat) {
      setShowPopover(true);
    } else {
      onStartChat();
    }
  };

  const visibleTags = character.tags.slice(0, 5);
  const extraTagCount = character.tags.length - visibleTags.length;

  // Truncate description for card preview
  const descPreview = character.description
    ? character.description.length > 120
      ? character.description.slice(0, 120) + "..."
      : character.description
    : "";

  return (
    <div
      ref={cardRef}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={handleClick}
      className="rounded-lg overflow-hidden flex flex-col transition-colors duration-150 relative"
      style={{
        background: hovered || showPopover ? C.cardBgHover : C.cardBg,
        border: `1px solid ${C.headerBorder}`,
        cursor: showPopover ? "default" : "pointer",
      }}
    >
      {/* ── Header: name + tag count ── */}
      <div
        className="flex items-center justify-between px-3 py-[0.4rem]"
        style={{
          background: C.headerBg,
          borderBottom: `1px solid ${C.headerBorder}`,
        }}
      >
        <span
          className="text-[0.9rem] font-bold leading-tight truncate"
          style={{ color: V.textBody }}
        >
          {character.name}
        </span>
        {character.tags.length > 0 && (
          <span
            className="text-[0.68rem] shrink-0 flex items-center gap-1"
            style={{ color: V.textMuted }}
            title={`${character.tags.length} tags`}
          >
            <TagIcon />
            {character.tags.length}
          </span>
        )}
      </div>

      {/* ── Body: image + content side by side ── */}
      <div className="flex" style={{ minHeight: 200, maxHeight: 200 }}>
        {/* Left: avatar image with stat overlay */}
        <div className="shrink-0 relative" style={{ width: 160 }}>
          {character.avatar_url ? (
            <Avatar
              src={character.avatar_url}
              alt={character.name}
              width={160}
              height="100%"
              borderRadius="0"
              className="absolute inset-0"
              style={{ width: "100%", height: "100%" }}
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center text-[2rem] font-medium"
              style={{ background: V.tagBg, color: V.textDim }}
            >
              {character.name.charAt(0).toUpperCase()}
            </div>
          )}

          {/* Bottom stat overlay on image */}
          <div
            className="absolute bottom-0 left-0 right-0 flex items-center justify-around px-1 py-[0.3rem]"
            style={{ background: C.statBarBg }}
          >
            <span className="flex items-center gap-[3px] text-[0.6rem]" style={{ color: C.statText }}>
              <HeartIcon /> {character.tags.length}
            </span>
            <span className="flex items-center gap-[3px] text-[0.6rem]" style={{ color: C.statText }}>
              <DownloadIcon /> --
            </span>
            <span className="flex items-center gap-[3px] text-[0.6rem]" style={{ color: C.statText }}>
              <TokenIcon /> --
            </span>
          </div>
        </div>

        {/* Right: description + tags + creator */}
        <div className="flex-1 min-w-0 flex flex-col p-2.5 gap-2">
          {/* Description */}
          {descPreview && (
            <p
              className="text-[0.72rem] leading-[1.45] m-0"
              style={{ color: C.descText }}
            >
              {descPreview}
            </p>
          )}

          {/* Tags row */}
          {visibleTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 mt-auto">
              <span className="text-[0.7rem] mr-[2px]" style={{ color: C.fireEmoji }}>
                🔥
              </span>
              {visibleTags.map((tag) => (
                <span
                  key={tag}
                  className="px-[0.4rem] py-[0.1rem] rounded-[3px] text-[0.6rem] leading-[1.4] truncate max-w-[5.5rem] border"
                  style={{
                    background: C.tagChipBg,
                    color: C.tagChipText,
                    borderColor: C.tagChipBorder,
                  }}
                >
                  {tag}
                </span>
              ))}
              {extraTagCount > 0 && (
                <span
                  className="px-[0.3rem] py-[0.1rem] text-[0.58rem] leading-[1.4]"
                  style={{ color: V.textDim }}
                >
                  +{extraTagCount}
                </span>
              )}
            </div>
          )}

          {/* Creator + age */}
          <div className="flex items-center gap-1.5 text-[0.68rem]" style={{ color: C.ageText }}>
            {character.creator && (
              <span style={{ color: C.creatorText }}>@{character.creator}</span>
            )}
            <span>{relativeTime(character.created_at)}</span>
          </div>
        </div>
      </div>

      {/* ── Hover actions ── */}
      {hovered && !showPopover && (
        <div
          className="absolute top-[0.35rem] right-[0.35rem] flex gap-[3px]"
          onClick={(e) => e.stopPropagation()}
        >
          <ActionBtn title="Edit" onClick={onEdit}>
            <EditIcon />
          </ActionBtn>
          <ActionBtn title="Delete" onClick={onDelete} destructive>
            <DeleteIcon />
          </ActionBtn>
        </div>
      )}

      {/* ── Continue / New popover ── */}
      {showPopover && recentChat && (
        <div
          className="absolute inset-0 flex items-center justify-center gap-2 px-4"
          style={{ background: "rgba(20,20,30,0.88)", backdropFilter: "blur(4px)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              setShowPopover(false);
              onContinueChat(recentChat.id);
            }}
            className="flex-1 px-3 py-2 border-none rounded-md cursor-pointer text-[0.78rem] text-white font-medium"
            style={{ background: V.primary }}
          >
            ↩ Continue
          </button>
          <button
            onClick={() => {
              setShowPopover(false);
              onStartChat();
            }}
            className="flex-1 px-3 py-2 rounded-md cursor-pointer text-[0.78rem] font-medium border"
            style={{ background: "transparent", color: V.tagText, borderColor: V.border }}
          >
            + New Chat
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Stat icons ──────────────────────────────────────────────────────────────

function HeartIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#c06070" }}>
      <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function TokenIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" />
    </svg>
  );
}

// ─── Tiny action button ──────────────────────────────────────────────────────

function ActionBtn({
  title,
  onClick,
  destructive,
  children,
}: {
  title: string;
  onClick: () => void;
  destructive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-[22px] h-[22px] p-0 border-none cursor-pointer flex items-center justify-center rounded-[4px] transition-colors duration-150"
      style={{ background: V.tagBg, color: destructive ? V.destructive : V.textMuted }}
    >
      {children}
    </button>
  );
}

// ─── Icons ───────────────────────────────────────────────────────────────────

function TagIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    </svg>
  );
}

function CreateIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function FileImportIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z" />
      <path d="M14 2v7h7" />
      <path d="M12 12v6" />
      <path d="m9.5 15 2.5 3 2.5-3" />
    </svg>
  );
}

function LinkImportIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 1 0-7l1.5-1.5a5 5 0 1 1 7 7L17 13" />
      <path d="M14 11a5 5 0 0 1 0 7L12.5 19.5a5 5 0 0 1-7-7L7 11" />
    </svg>
  );
}

function UrlInputIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "rgba(190, 210, 255, 0.8)" }}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a14.5 14.5 0 0 1 0 18" />
      <path d="M12 3a14.5 14.5 0 0 0 0 18" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function StatusDot() {
  return <span className="w-[5px] h-[5px] rounded-full bg-current shrink-0" />;
}

// ─── Character editor loader ─────────────────────────────────────────────────

function CharacterEditorLoader({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading } = useCharacter(id);
  if (isLoading || !data) return null;
  return <CharacterEditor character={data.character} onClose={onClose} />;
}
