import React from "react";
import type { SidebarView } from "../../templates/types.ts";
import {
  ChatManagementButton,
  HeaderActionButton,
} from "../chat/chat-header/HeaderControls.tsx";

type TopDockVariant = "default" | "discord" | "chub";
type TopDockDensity = "regular" | "compact";

interface TopDockProps {
  variant?: TopDockVariant;
  density?: TopDockDensity;
  collapsed: boolean;
  allowCollapse: boolean;
  showChatsButton: boolean;
  activePanel: SidebarView | null;
  chatCount: number;
  activeChatName: string | null;
  promptEnabled?: boolean;
  chatManagementEnabled?: boolean;
  onOpenThemePicker?: () => void;
  isExportingChat?: boolean;
  isRenamingChat?: boolean;
  onOpenModelDashboard?: () => void;
  onOpenPromptTemplate?: () => void;
  onRenameChat?: (name: string) => void | Promise<void>;
  onExportChat?: (format: "chat" | "jsonl" | "txt") => void;
  onToggleCollapsed?: () => void;
  onTogglePanel: (panel: SidebarView) => void;
}

const NAV_LABELS: Record<SidebarView, string> = {
  characters: "Characters",
  personas: "Personas",
  chats: "Chats",
};

export default function TopDock({
  variant = "default",
  density = "regular",
  collapsed,
  allowCollapse,
  showChatsButton,
  activePanel,
  chatCount,
  activeChatName,
  promptEnabled = false,
  chatManagementEnabled = false,
  onOpenThemePicker,
  isExportingChat = false,
  isRenamingChat = false,
  onOpenModelDashboard,
  onOpenPromptTemplate,
  onRenameChat,
  onExportChat,
  onToggleCollapsed,
  onTogglePanel,
}: TopDockProps) {
  const items: SidebarView[] = showChatsButton
    ? ["characters", "personas", "chats"]
    : ["characters", "personas"];

  const isCompact = density === "compact";
  const frameClassName =
    variant === "discord"
      ? "flex items-center gap-2 rounded-xl border border-white/6 bg-black/20 px-1 py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
      : variant === "chub"
        ? "flex items-center gap-2 rounded-2xl border border-white/10 bg-[rgba(255,245,232,0.06)] px-1.5 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
      : "flex items-center gap-2 rounded-2xl border border-border bg-surface-raised/75 px-1.5 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]";
  const brandClassName =
    variant === "discord"
      ? "rounded-md border border-white/8 bg-white/5 px-2 py-1 text-[0.63rem] font-semibold tracking-[0.18em] text-[#f2f3f5]"
      : variant === "chub"
        ? "rounded-full border border-white/10 bg-[rgba(255,245,232,0.06)] px-3 py-1 text-[0.68rem] font-semibold tracking-[0.18em] text-[rgba(229,213,197,0.78)]"
      : "rounded-full border border-border bg-background/65 px-3 py-1 text-[0.68rem] font-semibold tracking-[0.18em] text-text-muted";
  const chatChipClassName =
    variant === "discord"
      ? "hidden min-w-0 items-center gap-1 rounded-md bg-white/4 px-2 py-1 text-[0.68rem] text-[#949ba4] lg:flex"
      : variant === "chub"
        ? "hidden min-w-0 items-center gap-2 rounded-full border border-white/10 bg-[rgba(255,245,232,0.05)] px-3 py-1.5 text-[0.72rem] text-[rgba(229,213,197,0.72)] lg:flex"
      : "hidden min-w-0 items-center gap-2 rounded-full border border-border bg-background/55 px-3 py-1.5 text-[0.72rem] text-text-dim lg:flex";
  const utilityButtonClassName =
    variant === "discord"
      ? "inline-flex h-8 items-center justify-center rounded-lg border border-white/8 bg-white/5 px-2 text-[#b5bac1] transition-colors hover:text-[#f2f3f5]"
      : variant === "chub"
        ? "inline-flex h-9 items-center justify-center rounded-full border border-white/10 bg-[rgba(255,245,232,0.06)] px-3 text-[rgba(229,213,197,0.78)] transition-colors hover:text-white"
      : "inline-flex h-9 items-center justify-center rounded-full border border-border bg-background/65 px-3 text-text-muted transition-colors hover:text-text-body";

  if (collapsed && allowCollapse) {
    return (
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className={brandClassName}>PROSEUS</div>
          {activeChatName && (
            <div className={chatChipClassName}>
              <span className="truncate">{activeChatName}</span>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onToggleCollapsed}
          className={utilityButtonClassName}
          aria-label="Show top dock"
          title="Show top dock"
        >
          <MenuIcon />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className={brandClassName}>PROSEUS</div>
        {activeChatName && (
          <div className={chatChipClassName}>
            {variant === "discord" && <span className="text-[#5865F2]">#</span>}
            <span className="truncate">{activeChatName}</span>
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
        <div className={frameClassName}>
          {items.map((item) => (
            <DockButton
              key={item}
              variant={variant}
              compact={isCompact}
              active={activePanel === item}
              onClick={() => onTogglePanel(item)}
              label={NAV_LABELS[item]}
              badge={item === "chats" ? chatCount : 0}
            />
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <HeaderActionButton
            variant={variant}
            label="Themes"
            icon={<ThemeIcon />}
            onClick={() => onOpenThemePicker?.()}
            disabled={!onOpenThemePicker}
          />
          <HeaderActionButton
            variant={variant}
            label="Model"
            icon={<ModelIcon />}
            onClick={() => onOpenModelDashboard?.()}
            disabled={!onOpenModelDashboard}
          />
          <HeaderActionButton
            variant={variant}
            label="Prompt"
            icon={<PromptIcon />}
            onClick={() => onOpenPromptTemplate?.()}
            disabled={!promptEnabled || !onOpenPromptTemplate}
          />
          <ChatManagementButton
            variant={variant}
            chatName={activeChatName ?? "Chat"}
            isExporting={isExportingChat}
            isRenaming={isRenamingChat}
            onRename={onRenameChat}
            onExport={onExportChat ?? (() => undefined)}
            disabled={!chatManagementEnabled || !onExportChat}
          />
        </div>

        {allowCollapse && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            className={utilityButtonClassName}
            aria-label="Hide top dock"
            title="Hide top dock"
          >
            <ChevronUpIcon />
          </button>
        )}
      </div>
    </div>
  );
}

function DockButton({
  variant,
  compact,
  active,
  label,
  badge,
  onClick,
}: {
  variant: TopDockVariant;
  compact: boolean;
  active: boolean;
  label: string;
  badge?: number;
  onClick: () => void;
}) {
  const baseClassName = compact
    ? "inline-flex h-7 items-center gap-2 rounded-lg px-2.5 text-[0.67rem] font-medium transition-colors"
    : "inline-flex h-9 items-center gap-2 rounded-xl px-3 text-[0.76rem] font-medium transition-colors";

  const stateClassName =
    variant === "discord"
      ? active
        ? "bg-[#5865F2] text-white shadow-[0_4px_14px_rgba(88,101,242,0.28)]"
        : "text-[#b5bac1] hover:bg-white/6 hover:text-[#f2f3f5]"
      : variant === "chub"
        ? active
          ? "bg-[rgb(242,228,214)] text-[rgb(44,35,29)] shadow-[0_4px_14px_rgba(242,228,214,0.16)]"
          : "text-[rgba(229,213,197,0.78)] hover:bg-[rgba(255,245,232,0.08)] hover:text-white"
      : active
        ? "bg-background text-text-body shadow-sm"
        : "text-text-dim hover:bg-surface hover:text-text-body";

  const badgeClassName =
    variant === "discord"
      ? active
        ? "bg-white/18 text-white"
        : "bg-white/8 text-[#d7dce2]"
      : variant === "chub"
        ? active
          ? "bg-[rgba(44,35,29,0.12)] text-[rgb(44,35,29)]"
          : "bg-[rgba(255,245,232,0.08)] text-[rgba(229,213,197,0.78)]"
      : active
        ? "bg-foreground/10 text-text-body"
        : "bg-background/80 text-text-muted";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${baseClassName} ${stateClassName}`}
    >
      <span>{label}</span>
      {badge ? (
        <span
          className={`inline-flex min-w-[1.15rem] items-center justify-center rounded-full px-1.5 text-[0.62rem] ${badgeClassName}`}
        >
          {badge}
        </span>
      ) : null}
    </button>
  );
}

function ModelIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" stroke="currentColor" strokeWidth="2" />
      <line x1="8" y1="21" x2="16" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="12" y1="17" x2="12" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function PromptIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 20h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ThemeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="2" />
      <line x1="12" y1="1" x2="12" y2="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="12" y1="21" x2="12" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="1" y1="12" x2="3" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="21" y1="12" x2="23" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
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

function ChevronUpIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="m6 14 6-6 6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
