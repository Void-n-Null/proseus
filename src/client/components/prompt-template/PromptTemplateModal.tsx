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
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        fontFamily: "var(--font-body)",
        color: "var(--color-text-body)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.65rem 1rem",
          borderBottom: "1px solid var(--color-border)",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: "0.72rem",
            fontWeight: 400,
            letterSpacing: "0.15em",
            color: "var(--color-text-muted)",
            textTransform: "uppercase",
            fontFamily: "var(--font-display)",
          }}
        >
          Prompt Template
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          {isDirty && (
            <button
              onClick={handleSave}
              disabled={isUpdating}
              style={{
                padding: "0.3rem 0.85rem",
                background: "var(--color-primary)",
                color: "var(--color-background)",
                border: "none",
                borderRadius: "var(--radius-md)",
                cursor: isUpdating ? "wait" : "pointer",
                fontSize: "0.72rem",
                fontWeight: 500,
                opacity: isUpdating ? 0.6 : 1,
                transition: "opacity 0.15s",
              }}
            >
              {isUpdating ? "Saving\u2026" : "Save"}
            </button>
          )}
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "var(--color-text-dim)",
              cursor: "pointer",
              fontSize: "1rem",
              lineHeight: 1,
              padding: "0.2rem 0.3rem",
              transition: "color 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-text-body)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-text-dim)")}
          >
            ✕
          </button>
        </div>
      </div>

      {isLoading || !template ? (
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--color-text-dim)",
            fontSize: "0.82rem",
          }}
        >
          Loading…
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
          <div
            style={{
              width: 320,
              minWidth: 320,
              borderRight: "1px solid var(--color-border)",
              display: "flex",
              flexDirection: "column",
              overflowY: "auto",
            }}
          >
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

          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "0.75rem 1rem",
              background: "oklch(0.07 0.01 250)",
            }}
          >
            <div
              style={{
                fontSize: "0.62rem",
                letterSpacing: "0.12em",
                color: "var(--color-text-dim)",
                textTransform: "uppercase",
                marginBottom: "0.75rem",
              }}
            >
              Assembled Prompt Preview
            </div>

            {previewBlocks.length === 0 ? (
              <div style={{ color: "var(--color-text-dim)", fontSize: "0.78rem" }}>
                No slots enabled.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {previewBlocks.map((block, bi) => {
                  const colors = ROLE_COLORS[block.role];
                  return (
                    <div
                      key={bi}
                      style={{
                        borderRadius: "var(--radius-md)",
                        border: `1px solid ${colors.border}`,
                        background: colors.bg,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          padding: "0.3rem 0.65rem",
                          borderBottom: `1px solid ${colors.border}`,
                          fontSize: "0.58rem",
                          fontWeight: 600,
                          letterSpacing: "0.12em",
                          color: colors.text,
                          textTransform: "uppercase",
                          fontFamily: "var(--font-display)",
                        }}
                      >
                        {block.label}
                      </div>
                      <div style={{ padding: "0.5rem 0.65rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                        {block.segments.map((seg, si) => (
                          <div key={si}>
                            {block.segments.length > 1 && (
                              <div
                                style={{
                                  fontSize: "0.58rem",
                                  color: colors.text,
                                  opacity: 0.7,
                                  letterSpacing: "0.08em",
                                  marginBottom: "0.2rem",
                                  textTransform: "uppercase",
                                }}
                              >
                                {seg.slotLabel}
                              </div>
                            )}
                            <pre
                              style={{
                                margin: 0,
                                fontFamily: "var(--font-body)",
                                fontSize: "0.72rem",
                                color: "var(--color-text-body)",
                                whiteSpace: "pre-wrap",
                                wordBreak: "break-word",
                                lineHeight: 1.55,
                                opacity: seg.text.startsWith("[") ? 0.45 : 1,
                                fontStyle: seg.text.startsWith("[") ? "italic" : "normal",
                              }}
                            >
                              {seg.text}
                            </pre>
                            {si < block.segments.length - 1 && (
                              <div
                                style={{
                                  marginTop: "0.5rem",
                                  borderTop: `1px solid ${colors.border}`,
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
    <div style={{ padding: "0.35rem" }}>
      {slotsByZone.map(({ zone, label, items }) => (
        <div key={zone} style={{ marginBottom: "0.5rem" }}>
          <div
            style={{
              fontSize: "0.6rem",
              fontWeight: 500,
              letterSpacing: "0.1em",
              color: "var(--color-text-dim)",
              textTransform: "uppercase",
              padding: "0.4rem 0.5rem 0.2rem",
            }}
          >
            {label}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            {items.map(({ slot, index }) => {
              const meta = SLOT_META[slot.id];
              const isExpanded = expandedSlot === slot.id;
              const canReorder = zone === "pre_history";
              const isFirst = canReorder && index === items[0]?.index;
              const isLast = canReorder && index === items[items.length - 1]?.index;

              return (
                <div key={slot.id}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.4rem",
                      padding: "0.4rem 0.45rem",
                      borderRadius: "var(--radius-sm)",
                      cursor: meta.hasContent ? "pointer" : "default",
                      transition: "background 0.12s",
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
                      <div style={{ display: "flex", flexDirection: "column", gap: "1px", flexShrink: 0 }}>
                        <ArrowButton direction="up" disabled={!!isFirst} onClick={(e) => { e.stopPropagation(); onMoveUp(index); }} />
                        <ArrowButton direction="down" disabled={!!isLast} onClick={(e) => { e.stopPropagation(); onMoveDown(index); }} />
                      </div>
                    ) : (
                      <div style={{ width: 16, flexShrink: 0 }} />
                    )}

                    <button
                      onClick={(e) => { e.stopPropagation(); if (!meta.required) onToggle(slot.id); }}
                      disabled={meta.required}
                      style={{
                        width: 30,
                        height: 17,
                        borderRadius: 9,
                        border: "none",
                        cursor: meta.required ? "not-allowed" : "pointer",
                        background: slot.enabled ? "var(--color-primary)" : "var(--color-surface-raised)",
                        position: "relative",
                        flexShrink: 0,
                        transition: "background 0.15s",
                        opacity: meta.required ? 0.55 : 1,
                      }}
                    >
                      <div
                        style={{
                          width: 11,
                          height: 11,
                          borderRadius: "50%",
                          background: "oklch(0.95 0 0)",
                          position: "absolute",
                          top: 3,
                          left: slot.enabled ? 16 : 3,
                          transition: "left 0.15s",
                        }}
                      />
                    </button>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: "0.76rem",
                          fontWeight: 400,
                          color: slot.enabled ? "var(--color-text-body)" : "var(--color-text-dim)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {meta.label}
                      </div>
                      <div
                        style={{
                          fontSize: "0.62rem",
                          color: "var(--color-text-dim)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          marginTop: "1px",
                        }}
                      >
                        {meta.description}
                      </div>
                    </div>

                    {meta.hasContent && slot.content != null && slot.content.length > 0 && (
                      <span
                        style={{
                          fontSize: "0.6rem",
                          color: "var(--color-text-dim)",
                          flexShrink: 0,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        ~{estimateTokens(slot.content)} tk
                      </span>
                    )}

                    {meta.hasContent && (
                      <span
                        style={{
                          fontSize: "0.55rem",
                          color: "var(--color-text-dim)",
                          flexShrink: 0,
                          transition: "transform 0.15s",
                          transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                          display: "inline-block",
                        }}
                      >
                        ▶
                      </span>
                    )}
                  </div>

                  {isExpanded && meta.hasContent && (
                    <div style={{ padding: "0.2rem 0.45rem 0.45rem 2.5rem" }}>
                      <textarea
                        value={slot.content ?? ""}
                        onChange={(e) => onContentChange(slot.id, e.target.value)}
                        rows={5}
                        style={{
                          width: "100%",
                          resize: "vertical",
                          background: "var(--color-surface)",
                          color: "var(--color-text-body)",
                          border: "1px solid var(--color-border)",
                          borderRadius: "var(--radius-sm)",
                          padding: "0.4rem 0.5rem",
                          fontSize: "0.72rem",
                          fontFamily: "var(--font-body)",
                          lineHeight: 1.5,
                          outline: "none",
                          boxSizing: "border-box",
                        }}
                        onFocus={(e) => { e.currentTarget.style.borderColor = "var(--color-primary)"; }}
                        onBlur={(e) => { e.currentTarget.style.borderColor = "var(--color-border)"; }}
                      />
                      {meta.hasMacros && (
                        <div style={{ fontSize: "0.58rem", color: "var(--color-text-dim)", marginTop: "0.2rem" }}>
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
      style={{
        width: 16,
        height: 10,
        padding: 0,
        border: "none",
        background: "transparent",
        color: disabled ? "var(--color-surface-raised)" : "var(--color-text-dim)",
        cursor: disabled ? "default" : "pointer",
        fontSize: "0.48rem",
        lineHeight: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {direction === "up" ? "▲" : "▼"}
    </button>
  );
}
