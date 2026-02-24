import React, { useState, useRef, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../ui/dialog.tsx";
import MobileSlideUpSheet from "../ui/mobile-slide-up-sheet.tsx";
import { useIsMobile } from "../../hooks/useMediaQuery.ts";
import { usePromptTemplate } from "../../hooks/usePromptTemplate.ts";
import {
  SLOT_META,
  type SlotId,
  type SlotZone,
  type PromptSlot,
} from "../../../shared/prompt-template.ts";

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

const ZONE_LABELS: Record<SlotZone, string> = {
  pre_history: "Pre-History (System)",
  history: "Chat History",
  post_history: "Post-History",
};

const ZONE_ORDER: SlotZone[] = ["pre_history", "history", "post_history"];

const SLOT_PLACEHOLDER: Partial<Record<SlotId, string>> = {
  char_system_prompt: "[Character's own system prompt]",
  char_description: "[Character description]",
  char_personality: "Personality: [personality summary]",
  char_scenario: "Scenario: [scenario / setting text]",
  persona: "[User: Persona Name]\n[Persona description]",
  mes_example: "<START>\nUser: [example message]\nChar: [example reply]",
  history: "[↕ Chat messages appear here]",
  post_history: "[Post-history / jailbreak instructions]",
};

interface PreviewBlock {
  role: "system" | "history" | "assistant";
  label: string;
  segments: { slotLabel: string; text: string }[];
}

function buildPreview(slots: PromptSlot[]): PreviewBlock[] {
  const blocks: PreviewBlock[] = [];

  const preHistory = slots.filter(
    (s) => s.enabled && SLOT_META[s.id].zone === "pre_history",
  );
  if (preHistory.length > 0) {
    blocks.push({
      role: "system",
      label: "SYSTEM — Pre-History",
      segments: preHistory.map((s) => ({
        slotLabel: SLOT_META[s.id].label,
        text:
          SLOT_META[s.id].hasContent
            ? (s.content ?? "").trim() || "[empty]"
            : SLOT_PLACEHOLDER[s.id] ?? `[${SLOT_META[s.id].label}]`,
      })),
    });
  }

  const historySlot = slots.find(
    (s) => s.id === "history" && s.enabled,
  );
  if (historySlot) {
    blocks.push({
      role: "history",
      label: "HISTORY",
      segments: [{ slotLabel: "Chat History", text: SLOT_PLACEHOLDER.history! }],
    });
  }

  const postHistory = slots.find(
    (s) => s.id === "post_history" && s.enabled,
  );
  if (postHistory) {
    blocks.push({
      role: "system",
      label: "SYSTEM — Post-History",
      segments: [{ slotLabel: "After-History Instructions", text: SLOT_PLACEHOLDER.post_history! }],
    });
  }

  const prefill = slots.find(
    (s) => s.id === "assistant_prefill" && s.enabled,
  );
  if (prefill) {
    blocks.push({
      role: "assistant",
      label: "ASSISTANT (prefill)",
      segments: [
        {
          slotLabel: "Assistant Prefill",
          text: (prefill.content ?? "").trimEnd() || "[empty — AI will start freely]",
        },
      ],
    });
  }

  return blocks;
}

const ROLE_COLORS: Record<PreviewBlock["role"], { bg: string; text: string; border: string }> = {
  system:    { bg: "oklch(0.18 0.025 250 / 0.6)", text: "oklch(0.72 0.12 250)", border: "oklch(0.35 0.08 250 / 0.5)" },
  history:   { bg: "oklch(0.16 0.02 200 / 0.6)",  text: "oklch(0.68 0.10 200)", border: "oklch(0.32 0.06 200 / 0.5)" },
  assistant: { bg: "oklch(0.17 0.03 155 / 0.6)",  text: "oklch(0.70 0.15 155)", border: "oklch(0.34 0.09 155 / 0.5)" },
};

// ─── Public API (matches ModelDashboard) ────────────────────────────────────

export interface PromptTemplateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function PromptTemplateModal({
  open,
  onOpenChange,
}: PromptTemplateModalProps) {
  const isMobile = useIsMobile();

  const content = <PromptTemplateContent onClose={() => onOpenChange(false)} isMobile={isMobile} />;

  if (isMobile) {
    return (
      <MobileSlideUpSheet open={open} onClose={() => onOpenChange(false)}>
        {content}
      </MobileSlideUpSheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl p-0 gap-0 overflow-hidden">
        <div className="h-[700px]">
          {content}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Inner content (rendered inside Dialog or MobileSlideUpSheet) ────────────

function PromptTemplateContent({
  onClose,
  isMobile,
}: {
  onClose: () => void;
  isMobile: boolean;
}) {
  const { template, isLoading, updateTemplate, isUpdating } = usePromptTemplate();
  const [localSlots, setLocalSlots] = useState<PromptSlot[] | null>(null);
  const [expandedSlot, setExpandedSlot] = useState<SlotId | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const initializedRef = useRef(false);

  if (template && !initializedRef.current) {
    initializedRef.current = true;
    setLocalSlots(template.slots.map((s) => ({ ...s })));
  }

  const slots = localSlots ?? [];

  const isDirty = (() => {
    if (!template || !localSlots) return false;
    if (template.slots.length !== localSlots.length) return true;
    return template.slots.some((saved, i) => {
      const local = localSlots[i]!;
      return (
        saved.id !== local.id ||
        saved.enabled !== local.enabled ||
        (saved.content ?? "") !== (local.content ?? "")
      );
    });
  })();

  const handleToggle = useCallback((id: SlotId) => {
    setLocalSlots((prev) =>
      prev?.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)) ?? null,
    );
  }, []);

  const handleContentChange = useCallback((id: SlotId, content: string) => {
    setLocalSlots((prev) =>
      prev?.map((s) => (s.id === id ? { ...s, content } : s)) ?? null,
    );
  }, []);

  const handleMoveUp = useCallback((index: number) => {
    setLocalSlots((prev) => {
      if (!prev) return null;
      const slot = prev[index];
      if (!slot || SLOT_META[slot.id].zone !== "pre_history") return prev;
      const preHistoryStart = prev.findIndex((s) => SLOT_META[s.id].zone === "pre_history");
      if (index <= preHistoryStart) return prev;
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index]!, next[index - 1]!];
      return next;
    });
  }, []);

  const handleMoveDown = useCallback((index: number) => {
    setLocalSlots((prev) => {
      if (!prev) return null;
      const slot = prev[index];
      if (!slot || SLOT_META[slot.id].zone !== "pre_history") return prev;
      const preHistoryEnd =
        prev.length - 1 -
        [...prev].reverse().findIndex((s) => SLOT_META[s.id].zone === "pre_history");
      if (index >= preHistoryEnd) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1]!, next[index]!];
      return next;
    });
  }, []);

  const handleSave = useCallback(() => {
    if (!localSlots || isUpdating) return;
    updateTemplate({ slots: localSlots });
  }, [localSlots, isUpdating, updateTemplate]);

  const toggleExpand = useCallback((id: SlotId) => {
    setExpandedSlot((prev) => (prev === id ? null : id));
  }, []);

  const previewBlocks = buildPreview(slots);

  return (
    <div className="flex flex-col h-full font-body text-text-body bg-surface-sunken rounded-2xl">
      {/* Header */}
      {isMobile ? (
        <div className="flex flex-col space-y-1.5 px-4 pt-4 pb-0">
          <h2 className="text-foreground text-lg font-semibold leading-none tracking-tight">
            Prompt Template
          </h2>
          <p className="text-text-muted text-sm">
            Configure the prompt assembly order and content.
          </p>
          <div className="flex items-center gap-2 pt-1">
            {isDirty && (
              <button
                onClick={handleSave}
                disabled={isUpdating}
                className="px-3 py-1.5 bg-primary text-background border-none rounded-md text-[0.75rem] font-medium transition-opacity duration-150 cursor-pointer disabled:opacity-60 disabled:cursor-wait"
              >
                {isUpdating ? "Saving\u2026" : "Save"}
              </button>
            )}
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="px-3 py-1.5 bg-transparent text-text-muted border border-border rounded-md text-[0.75rem] font-medium transition-colors duration-150 cursor-pointer hover:text-text-body hover:border-text-dim"
            >
              {showPreview ? "Editor" : "Preview"}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between px-6 pr-12 pt-5 pb-0">
          <DialogHeader>
            <DialogTitle className="text-foreground text-lg font-semibold">
              Prompt Template
            </DialogTitle>
            <DialogDescription className="text-text-muted text-sm">
              Configure the prompt assembly order and content.
            </DialogDescription>
          </DialogHeader>
          {isDirty && (
            <button
              onClick={handleSave}
              disabled={isUpdating}
              className="px-[0.85rem] py-[0.3rem] bg-primary text-background border-none rounded-md text-[0.72rem] font-medium transition-opacity duration-150 cursor-pointer disabled:opacity-60 disabled:cursor-wait"
            >
              {isUpdating ? "Saving\u2026" : "Save"}
            </button>
          )}
        </div>
      )}

      {/* Body */}
      {isLoading || !template ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            <span className="text-sm text-text-muted">Loading template...</span>
          </div>
        </div>
      ) : isMobile ? (
        /* Mobile: single column, toggle between editor and preview */
        <div className="flex-1 min-h-0 overflow-y-auto">
          {showPreview ? (
            <PromptPreview blocks={previewBlocks} />
          ) : (
            <SlotEditor
              slots={slots}
              expandedSlot={expandedSlot}
              onToggle={handleToggle}
              onContentChange={handleContentChange}
              onMoveUp={handleMoveUp}
              onMoveDown={handleMoveDown}
              onToggleExpand={toggleExpand}
            />
          )}
        </div>
      ) : (
        /* Desktop: side-by-side slot editor + preview */
        <div className="flex-1 flex min-h-0 mt-3">
          <div className="w-80 min-w-80 border-r border-border flex flex-col overflow-y-auto">
            <SlotEditor
              slots={slots}
              expandedSlot={expandedSlot}
              onToggle={handleToggle}
              onContentChange={handleContentChange}
              onMoveUp={handleMoveUp}
              onMoveDown={handleMoveDown}
              onToggleExpand={toggleExpand}
            />
          </div>

          <PromptPreview blocks={previewBlocks} />
        </div>
      )}
    </div>
  );
}

// ─── Preview panel ──────────────────────────────────────────────────────────

function PromptPreview({ blocks }: { blocks: PreviewBlock[] }) {
  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 bg-[oklch(0.07_0.01_250)]">
      <div className="text-[0.62rem] tracking-[0.12em] text-text-dim uppercase mb-3">
        Assembled Prompt Preview
      </div>

      {blocks.length === 0 ? (
        <div className="text-text-dim text-[0.78rem]">
          No slots enabled.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {blocks.map((block, bi) => {
            const colors = ROLE_COLORS[block.role];
            return (
              <div
                key={bi}
                className="rounded-md overflow-hidden"
                style={{
                  border: `1px solid ${colors.border}`,
                  background: colors.bg,
                }}
              >
                <div
                  className="px-[0.65rem] py-[0.3rem] text-[0.58rem] font-semibold tracking-[0.12em] uppercase font-display"
                  style={{
                    borderBottom: `1px solid ${colors.border}`,
                    color: colors.text,
                  }}
                >
                  {block.label}
                </div>
                <div className="px-[0.65rem] py-[0.5rem] flex flex-col gap-2">
                  {block.segments.map((seg, si) => (
                    <div key={si}>
                      {block.segments.length > 1 && (
                        <div
                          className="text-[0.58rem] opacity-70 tracking-[0.08em] mb-[0.2rem] uppercase"
                          style={{ color: colors.text }}
                        >
                          {seg.slotLabel}
                        </div>
                      )}
                      <pre
                        className="m-0 font-body text-[0.72rem] text-text-body whitespace-pre-wrap break-words leading-[1.55]"
                        style={{
                          opacity: seg.text.startsWith("[") ? 0.45 : 1,
                          fontStyle: seg.text.startsWith("[") ? "italic" : "normal",
                        }}
                      >
                        {seg.text}
                      </pre>
                      {si < block.segments.length - 1 && (
                        <div
                          className="mt-2"
                          style={{ borderTop: `1px solid ${colors.border}` }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Slot editor ────────────────────────────────────────────────────────────

function SlotEditor({
  slots,
  expandedSlot,
  onToggle,
  onContentChange,
  onMoveUp,
  onMoveDown,
  onToggleExpand,
}: {
  slots: PromptSlot[];
  expandedSlot: SlotId | null;
  onToggle: (id: SlotId) => void;
  onContentChange: (id: SlotId, content: string) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onToggleExpand: (id: SlotId) => void;
}) {
  const slotsByZone = ZONE_ORDER.map((zone) => ({
    zone,
    label: ZONE_LABELS[zone],
    items: slots
      .map((slot, index) => ({ slot, index }))
      .filter(({ slot }) => SLOT_META[slot.id].zone === zone),
  }));

  return (
    <div className="p-[0.35rem]">
      {slotsByZone.map(({ zone, label, items }) => (
        <div key={zone} className="mb-2">
          <div className="text-[0.6rem] font-medium tracking-[0.1em] text-text-dim uppercase px-2 pt-[0.4rem] pb-[0.2rem]">
            {label}
          </div>
          <div className="flex flex-col gap-[2px]">
            {items.map(({ slot, index }) => {
              const meta = SLOT_META[slot.id];
              const isExpanded = expandedSlot === slot.id;
              const canReorder = zone === "pre_history";
              const isFirst = canReorder && index === items[0]?.index;
              const isLast = canReorder && index === items[items.length - 1]?.index;

              return (
                <div key={slot.id}>
                  <div
                    className="flex items-center gap-[0.4rem] px-[0.45rem] py-[0.4rem] rounded-sm transition-[background] duration-[0.12s]"
                    style={{
                      cursor: meta.hasContent ? "pointer" : "default",
                      background: isExpanded ? "var(--color-surface-hover)" : "transparent",
                    }}
                    onClick={meta.hasContent ? () => onToggleExpand(slot.id) : undefined}
                    onMouseEnter={(e) => {
                      if (!isExpanded) e.currentTarget.style.background = "var(--color-surface-hover)";
                    }}
                    onMouseLeave={(e) => {
                      if (!isExpanded) e.currentTarget.style.background = "transparent";
                    }}
                  >
                    {canReorder ? (
                      <div className="flex flex-col gap-px shrink-0">
                        <ArrowButton direction="up" disabled={!!isFirst} onClick={(e) => { e.stopPropagation(); onMoveUp(index); }} />
                        <ArrowButton direction="down" disabled={!!isLast} onClick={(e) => { e.stopPropagation(); onMoveDown(index); }} />
                      </div>
                    ) : (
                      <div className="w-4 shrink-0" />
                    )}

                    <button
                      onClick={(e) => { e.stopPropagation(); if (!meta.required) onToggle(slot.id); }}
                      disabled={meta.required}
                      className="w-[30px] h-[17px] rounded-[9px] border-none relative shrink-0 transition-[background] duration-[0.15s]"
                      style={{
                        cursor: meta.required ? "not-allowed" : "pointer",
                        background: slot.enabled ? "var(--color-primary)" : "var(--color-surface-raised)",
                        opacity: meta.required ? 0.55 : 1,
                      }}
                    >
                      <div
                        className="w-[11px] h-[11px] rounded-full bg-[oklch(0.95_0_0)] absolute top-[3px] transition-[left] duration-[0.15s]"
                        style={{ left: slot.enabled ? 16 : 3 }}
                      />
                    </button>

                    <div className="flex-1 min-w-0">
                      <div
                        className="text-[0.76rem] font-normal whitespace-nowrap overflow-hidden text-ellipsis"
                        style={{ color: slot.enabled ? "var(--color-text-body)" : "var(--color-text-dim)" }}
                      >
                        {meta.label}
                      </div>
                      <div className="text-[0.62rem] text-text-dim whitespace-nowrap overflow-hidden text-ellipsis mt-px">
                        {meta.description}
                      </div>
                    </div>

                    {meta.hasContent && slot.content != null && slot.content.length > 0 && (
                      <span className="text-[0.6rem] text-text-dim shrink-0 tabular-nums">
                        ~{estimateTokens(slot.content)} tk
                      </span>
                    )}

                    {meta.hasContent && (
                      <span
                        className="text-[0.55rem] text-text-dim shrink-0 transition-transform duration-[0.15s] inline-block"
                        style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)" }}
                      >
                        ▶
                      </span>
                    )}
                  </div>

                  {isExpanded && meta.hasContent && (
                    <div className="pt-[0.2rem] pr-[0.45rem] pb-[0.45rem] pl-10">
                      <textarea
                        value={slot.content ?? ""}
                        onChange={(e) => onContentChange(slot.id, e.target.value)}
                        rows={5}
                        className="w-full resize-y bg-surface text-text-body border border-border rounded-sm px-2 py-[0.4rem] text-[0.72rem] font-body leading-normal outline-none box-border"
                        onFocus={(e) => { e.currentTarget.style.borderColor = "var(--color-primary)"; }}
                        onBlur={(e) => { e.currentTarget.style.borderColor = "var(--color-border)"; }}
                      />
                      {meta.hasMacros && (
                        <div className="text-[0.58rem] text-text-dim mt-[0.2rem]">
                          {"Supports {{char}} and {{user}} macros"}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function ArrowButton({
  direction,
  disabled,
  onClick,
}: {
  direction: "up" | "down";
  disabled: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-4 h-[10px] p-0 border-none bg-transparent text-[0.48rem] leading-none flex items-center justify-center"
      style={{
        color: disabled ? "var(--color-surface-raised)" : "var(--color-text-dim)",
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {direction === "up" ? "▲" : "▼"}
    </button>
  );
}
