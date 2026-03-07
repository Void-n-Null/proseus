import React, { useEffect, useRef, useState } from "react";

type HeaderControlVariant = "default" | "discord" | "chub";

interface HeaderActionButtonProps {
  variant: HeaderControlVariant;
  label: string;
  title?: string;
  icon: React.ReactNode;
  onClick: () => void;
  showLabel?: boolean;
  disabled?: boolean;
}

interface ChatManagementButtonProps {
  variant: HeaderControlVariant;
  chatName: string;
  isExporting: boolean;
  isRenaming?: boolean;
  onRename?: (name: string) => void | Promise<void>;
  onExport: (format: "chat" | "jsonl" | "txt") => void;
  showLabel?: boolean;
  disabled?: boolean;
}

export function HeaderActionButton({
  variant,
  label,
  title,
  icon,
  onClick,
  showLabel = true,
  disabled = false,
}: HeaderActionButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={title ?? label}
      aria-label={label}
      className={getButtonClassName(variant, false, disabled)}
    >
      <span className="shrink-0">{icon}</span>
      {showLabel ? <span className="truncate">{label}</span> : null}
    </button>
  );
}

export function ChatManagementButton({
  variant,
  chatName,
  isExporting,
  isRenaming = false,
  onRename,
  onExport,
  showLabel = true,
  disabled = false,
}: ChatManagementButtonProps) {
  const [open, setOpen] = useState(false);
  const [draftName, setDraftName] = useState(chatName);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      setDraftName(chatName);
    }
  }, [chatName, open]);

  useEffect(() => {
    if (!open) return;

    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!rootRef.current?.contains(target)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const handleRename = async () => {
    const nextName = draftName.trim();
    if (!nextName || !onRename) return;
    await onRename(nextName);
    setOpen(false);
  };

  const popoverClassName =
    variant === "discord"
      ? "absolute right-0 top-[calc(100%+6px)] z-30 w-[19rem] rounded-xl border border-[#1f2023] bg-[#111214] p-3 shadow-[0_12px_32px_rgba(0,0,0,0.6)]"
      : variant === "chub"
        ? "absolute right-0 top-[calc(100%+8px)] z-30 w-[19rem] rounded-2xl border border-white/10 bg-[rgb(28,23,20)] p-3 shadow-[0_12px_40px_rgba(0,0,0,0.34)]"
        : "absolute right-0 top-[calc(100%+8px)] z-30 w-[19rem] rounded-2xl border border-border bg-surface p-3 shadow-lg";
  const inputClassName =
    variant === "discord"
      ? "w-full rounded-lg border border-[#1f2023] bg-[#1a1c20] px-3 py-2 text-sm text-[#f2f3f5] outline-none"
      : variant === "chub"
        ? "w-full rounded-xl border border-white/10 bg-[rgba(255,245,232,0.05)] px-3 py-2 text-sm text-[rgb(241,230,220)] outline-none"
        : "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-text-body outline-none";
  const secondaryActionClassName =
    variant === "discord"
      ? "w-full rounded-lg px-3 py-2 text-left text-xs text-[#b5bac1] transition-colors hover:bg-[#5865F2] hover:text-white"
      : variant === "chub"
        ? "w-full rounded-xl px-3 py-2 text-left text-xs text-[rgba(229,213,197,0.78)] transition-colors hover:bg-[rgba(255,245,232,0.10)] hover:text-white"
        : "w-full rounded-xl px-3 py-2 text-left text-xs text-text-muted transition-colors hover:bg-surface-raised hover:text-text-body";
  const primaryActionClassName =
    variant === "discord"
      ? "inline-flex items-center justify-center rounded-lg bg-[#5865F2] px-3 py-2 text-xs font-medium text-white transition-colors hover:brightness-110 disabled:opacity-50"
      : variant === "chub"
        ? "inline-flex items-center justify-center rounded-xl bg-[rgb(242,228,214)] px-3 py-2 text-xs font-medium text-[rgb(44,35,29)] transition-colors hover:brightness-105 disabled:opacity-50"
        : "inline-flex items-center justify-center rounded-xl bg-primary px-3 py-2 text-xs font-medium text-white transition-colors hover:brightness-110 disabled:opacity-50";
  const subtleTextClassName =
    variant === "discord"
      ? "text-[#949ba4]"
      : variant === "chub"
        ? "text-[rgba(229,213,197,0.56)]"
        : "text-text-dim";

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!disabled) setOpen((value) => !value);
        }}
        aria-label="Chat management"
        title="Chat management"
        className={getButtonClassName(variant, open, disabled)}
      >
        <span className="shrink-0">
          <ExportIcon />
        </span>
        {showLabel ? <span className="truncate">Chat</span> : null}
      </button>

      {open ? (
        <div className={popoverClassName}>
          <div className="space-y-3">
            <div>
              <div className={`mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em] ${subtleTextClassName}`}>
                Rename Chat
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={draftName}
                  onChange={(event) => setDraftName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      void handleRename();
                    }
                  }}
                  className={inputClassName}
                  placeholder="Chat name"
                />
                <button
                  type="button"
                  onClick={() => void handleRename()}
                  disabled={
                    !onRename ||
                    isRenaming ||
                    draftName.trim().length === 0 ||
                    draftName.trim() === chatName.trim()
                  }
                  className={primaryActionClassName}
                >
                  {isRenaming ? "Saving" : "Save"}
                </button>
              </div>
            </div>

            <div className={dividerClassName(variant)} />

            <div>
              <div className={`mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em] ${subtleTextClassName}`}>
                Export Chat
              </div>
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => {
                    onExport("chat");
                    setOpen(false);
                  }}
                  className={secondaryActionClassName}
                  disabled={isExporting}
                >
                  Proseus archive (.chat)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onExport("jsonl");
                    setOpen(false);
                  }}
                  className={secondaryActionClassName}
                  disabled={isExporting}
                >
                  JSONL (SillyTavern)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onExport("txt");
                    setOpen(false);
                  }}
                  className={secondaryActionClassName}
                  disabled={isExporting}
                >
                  Text transcript (.txt)
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function getButtonClassName(
  variant: HeaderControlVariant,
  active = false,
  disabled = false,
): string {
  if (variant === "discord") {
    return `inline-flex h-8 items-center gap-2 rounded-lg px-2.5 text-[0.72rem] font-medium transition-colors ${
      active
        ? "bg-[#5865F2] text-white"
        : "border border-[#2b2d31] bg-[#23252a] text-[#b5bac1] hover:text-[#f2f3f5]"
    } ${disabled ? "cursor-not-allowed opacity-45 hover:text-[#b5bac1]" : ""}`;
  }

  if (variant === "chub") {
    return `inline-flex h-9 items-center gap-2 rounded-full px-3 text-[0.73rem] transition-colors ${
      active
        ? "bg-[rgb(242,228,214)] text-[rgb(44,35,29)]"
        : "border border-white/10 bg-[rgba(255,245,232,0.06)] text-[rgba(229,213,197,0.78)] hover:text-white"
    } ${disabled ? "cursor-not-allowed opacity-45 hover:text-[rgba(229,213,197,0.78)]" : ""}`;
  }

  return `inline-flex h-9 items-center gap-2 rounded-xl px-3 text-[0.74rem] transition-colors ${
    active
      ? "bg-background text-text-body shadow-sm"
      : "border border-border bg-surface-raised text-text-muted hover:text-text-body"
  } ${disabled ? "cursor-not-allowed opacity-45 hover:text-text-muted" : ""}`;
}

function dividerClassName(variant: HeaderControlVariant): string {
  if (variant === "discord") return "border-t border-[#1f2023]";
  if (variant === "chub") return "border-t border-white/10";
  return "border-t border-border";
}

function ExportIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="7 10 12 15 17 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
