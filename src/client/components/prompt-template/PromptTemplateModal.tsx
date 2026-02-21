import React, { useState, useRef, useCallback } from "react";
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

export default function PromptTemplateModal({ onClose }: { onClose: () => void }) {
  const { template, isLoading, updateTemplate, isUpdating } = usePromptTemplate();
  const [localSlots, setLocalSlots] = useState<PromptSlot[] | null>(null);
  const [expandedSlot, setExpandedSlot] = useState<SlotId | null>(null);
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
    <div className="flex flex-col h-full font-body text-text-body">
      <div className="flex items-center justify-between px-4 py-[0.65rem] border-b border-border shrink-0">
        <span className="text-[0.72rem] font-normal tracking-[0.15em] text-text-muted uppercase font-display">
          Prompt Template
        </span>
        <div className="flex items-center gap-3">
          {isDirty && (
            <button
              onClick={handleSave}
              disabled={isUpdating}
              className="px-[0.85rem] py-[0.3rem] bg-primary text-background border-none rounded-md text-[0.72rem] font-medium transition-opacity duration-[0.15s]"
              style={{
                /* intentionally dynamic */ cursor: isUpdating ? "wait" : "pointer",
                /* intentionally dynamic */ opacity: isUpdating ? 0.6 : 1,
              }}
            >
              {isUpdating ? "Saving\u2026" : "Save"}
            </button>
          )}
          <button
            onClick={onClose}
            className="bg-transparent border-none text-text-dim cursor-pointer text-base leading-none px-[0.3rem] py-[0.2rem] transition-colors duration-[0.15s]"
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-text-body)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-text-dim)")}
          >
            ✕
          </button>
        </div>
      </div>

      {isLoading || !template ? (
        <div className="flex-1 flex items-center justify-center text-text-dim text-[0.82rem]">
          Loading…
        </div>
      ) : (
        <div className="flex-1 flex min-h-0">
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

          <div className="flex-1 overflow-y-auto px-4 py-3 bg-[oklch(0.07_0.01_250)]">
            <div className="text-[0.62rem] tracking-[0.12em] text-text-dim uppercase mb-3">
              Assembled Prompt Preview
            </div>

            {previewBlocks.length === 0 ? (
              <div className="text-text-dim text-[0.78rem]">
                No slots enabled.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {previewBlocks.map((block, bi) => {
                  const colors = ROLE_COLORS[block.role];
                  return (
                    <div
                      key={bi}
                      className="rounded-md overflow-hidden"
                      style={{
                        /* intentionally dynamic */ border: `1px solid ${colors.border}`,
                        /* intentionally dynamic */ background: colors.bg,
                      }}
                    >
                      <div
                        className="px-[0.65rem] py-[0.3rem] text-[0.58rem] font-semibold tracking-[0.12em] uppercase font-display"
                        style={{
                          /* intentionally dynamic */ borderBottom: `1px solid ${colors.border}`,
                          /* intentionally dynamic */ color: colors.text,
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
                                style={{
                                  /* intentionally dynamic */ color: colors.text,
                                }}
                              >
                                {seg.slotLabel}
                              </div>
                            )}
                            <pre
                              className="m-0 font-body text-[0.72rem] text-text-body whitespace-pre-wrap break-words leading-[1.55]"
                              style={{
                                /* intentionally dynamic */ opacity: seg.text.startsWith("[") ? 0.45 : 1,
                                /* intentionally dynamic */ fontStyle: seg.text.startsWith("[") ? "italic" : "normal",
                              }}
                            >
                              {seg.text}
                            </pre>
                            {si < block.segments.length - 1 && (
                              <div
                                className="mt-2"
                                style={{
                                  /* intentionally dynamic */ borderTop: `1px solid ${colors.border}`,
                                }}
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
        </div>
      )}
    </div>
  );
}

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
                      /* intentionally dynamic */ cursor: meta.hasContent ? "pointer" : "default",
                      /* intentionally dynamic */ background: isExpanded ? "var(--color-surface-hover)" : "transparent",
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
                        /* intentionally dynamic */ cursor: meta.required ? "not-allowed" : "pointer",
                        /* intentionally dynamic */ background: slot.enabled ? "var(--color-primary)" : "var(--color-surface-raised)",
                        /* intentionally dynamic */ opacity: meta.required ? 0.55 : 1,
                      }}
                    >
                      <div
                        className="w-[11px] h-[11px] rounded-full bg-[oklch(0.95_0_0)] absolute top-[3px] transition-[left] duration-[0.15s]"
                        style={{
                          /* intentionally dynamic */ left: slot.enabled ? 16 : 3,
                        }}
                      />
                    </button>

                    <div className="flex-1 min-w-0">
                      <div
                        className="text-[0.76rem] font-normal whitespace-nowrap overflow-hidden text-ellipsis"
                        style={{
                          /* intentionally dynamic */ color: slot.enabled ? "var(--color-text-body)" : "var(--color-text-dim)",
                        }}
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
                        style={{
                          /* intentionally dynamic */ transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                        }}
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
        /* intentionally dynamic */ color: disabled ? "var(--color-surface-raised)" : "var(--color-text-dim)",
        /* intentionally dynamic */ cursor: disabled ? "default" : "pointer",
      }}
    >
      {direction === "up" ? "▲" : "▼"}
    </button>
  );
}
