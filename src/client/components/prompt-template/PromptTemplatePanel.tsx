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

export default function PromptTemplatePanel() {
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
      if (!slot) return prev;
      if (SLOT_META[slot.id].zone !== "pre_history") return prev;
      const preHistoryStart = prev.findIndex(
        (s) => SLOT_META[s.id].zone === "pre_history",
      );
      if (index <= preHistoryStart) return prev;
      const next = [...prev];
      const above = next[index - 1];
      const current = next[index];
      if (!above || !current) return prev;
      next[index - 1] = current;
      next[index] = above;
      return next;
    });
  }, []);

  const handleMoveDown = useCallback((index: number) => {
    setLocalSlots((prev) => {
      if (!prev) return null;
      const slot = prev[index];
      if (!slot) return prev;
      if (SLOT_META[slot.id].zone !== "pre_history") return prev;
      const preHistoryEnd =
        prev.length -
        1 -
        [...prev].reverse().findIndex((s) => SLOT_META[s.id].zone === "pre_history");
      if (index >= preHistoryEnd) return prev;
      const next = [...prev];
      const current = next[index];
      const below = next[index + 1];
      if (!current || !below) return prev;
      next[index] = below;
      next[index + 1] = current;
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

  if (isLoading || !template) {
    return (
      <div style={panelStyle}>
        <div style={headerStyle}>Prompt Template</div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flex: 1,
            color: "var(--color-text-dim)",
            fontSize: "0.82rem",
          }}
        >
          Loading...
        </div>
      </div>
    );
  }

  const slotsByZone = ZONE_ORDER.map((zone) => ({
    zone,
    label: ZONE_LABELS[zone],
    items: slots
      .map((slot, index) => ({ slot, index }))
      .filter(({ slot }) => SLOT_META[slot.id].zone === zone),
  }));

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>Prompt Template</div>

      <div style={{ flex: 1, overflowY: "auto", padding: "0.5rem" }}>
        {slotsByZone.map(({ zone, label, items }) => (
          <div key={zone} style={{ marginBottom: "0.75rem" }}>
            <div style={zoneLabelStyle}>{label}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              {items.map(({ slot, index }) => {
                const meta = SLOT_META[slot.id];
                const isExpanded = expandedSlot === slot.id;
                const canReorder = zone === "pre_history";
                const isFirst =
                  canReorder && index === items[0]?.index;
                const isLast =
                  canReorder && index === items[items.length - 1]?.index;

                return (
                  <div key={slot.id}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        padding: "0.45rem 0.5rem",
                        borderRadius: "var(--radius-sm)",
                        cursor: meta.hasContent ? "pointer" : "default",
                        transition: "background 0.12s",
                        background: isExpanded
                          ? "var(--color-surface-hover)"
                          : "transparent",
                      }}
                      onClick={
                        meta.hasContent ? () => toggleExpand(slot.id) : undefined
                      }
                      onMouseEnter={(e) => {
                        if (!isExpanded)
                          e.currentTarget.style.background =
                            "var(--color-surface-hover)";
                      }}
                      onMouseLeave={(e) => {
                        if (!isExpanded)
                          e.currentTarget.style.background = "transparent";
                      }}
                    >
                      {canReorder ? (
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "1px",
                            flexShrink: 0,
                          }}
                        >
                          <ArrowButton
                            direction="up"
                            disabled={isFirst}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMoveUp(index);
                            }}
                          />
                          <ArrowButton
                            direction="down"
                            disabled={isLast}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMoveDown(index);
                            }}
                          />
                        </div>
                      ) : (
                        <div style={{ width: 16, flexShrink: 0 }} />
                      )}

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!meta.required) handleToggle(slot.id);
                        }}
                        disabled={meta.required}
                        style={{
                          width: 32,
                          height: 18,
                          borderRadius: 9,
                          border: "none",
                          cursor: meta.required ? "not-allowed" : "pointer",
                          background: slot.enabled
                            ? "var(--color-primary)"
                            : "var(--color-surface-raised)",
                          position: "relative",
                          flexShrink: 0,
                          transition: "background 0.15s",
                          opacity: meta.required ? 0.6 : 1,
                        }}
                      >
                        <div
                          style={{
                            width: 12,
                            height: 12,
                            borderRadius: "50%",
                            background: "var(--color-text-body)",
                            position: "absolute",
                            top: 3,
                            left: slot.enabled ? 17 : 3,
                            transition: "left 0.15s",
                          }}
                        />
                      </button>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: "0.78rem",
                            fontWeight: 400,
                            color: slot.enabled
                              ? "var(--color-text-body)"
                              : "var(--color-text-dim)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {meta.label}
                        </div>
                        <div
                          style={{
                            fontSize: "0.65rem",
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
                            fontSize: "0.62rem",
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
                            fontSize: "0.6rem",
                            color: "var(--color-text-dim)",
                            flexShrink: 0,
                            transition: "transform 0.15s",
                            transform: isExpanded
                              ? "rotate(90deg)"
                              : "rotate(0deg)",
                          }}
                        >
                          {"\u25B6"}
                        </span>
                      )}
                    </div>

                    {isExpanded && meta.hasContent && (
                      <div style={{ padding: "0.25rem 0.5rem 0.5rem 2.75rem" }}>
                        <textarea
                          value={slot.content ?? ""}
                          onChange={(e) =>
                            handleContentChange(slot.id, e.target.value)
                          }
                          rows={5}
                          style={{
                            width: "100%",
                            resize: "vertical",
                            background: "var(--color-surface)",
                            color: "var(--color-text-body)",
                            border: "1px solid var(--color-border)",
                            borderRadius: "var(--radius-sm)",
                            padding: "0.4rem 0.5rem",
                            fontSize: "0.75rem",
                            fontFamily: "var(--font-body)",
                            lineHeight: 1.5,
                            outline: "none",
                            boxSizing: "border-box",
                          }}
                          onFocus={(e) => {
                            e.currentTarget.style.borderColor =
                              "var(--color-primary)";
                          }}
                          onBlur={(e) => {
                            e.currentTarget.style.borderColor =
                              "var(--color-border)";
                          }}
                        />
                        {meta.hasMacros && (
                          <div
                            style={{
                              fontSize: "0.6rem",
                              color: "var(--color-text-dim)",
                              marginTop: "0.2rem",
                            }}
                          >
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

      {isDirty && (
        <div
          style={{
            padding: "0.5rem 0.75rem",
            borderTop: "1px solid var(--color-border)",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <button
            onClick={handleSave}
            disabled={isUpdating}
            style={{
              padding: "0.4rem 1rem",
              background: "var(--color-primary)",
              color: "var(--color-background)",
              border: "none",
              borderRadius: "var(--radius-md)",
              cursor: isUpdating ? "wait" : "pointer",
              fontSize: "0.75rem",
              fontWeight: 500,
              opacity: isUpdating ? 0.6 : 1,
              transition: "opacity 0.15s",
            }}
          >
            {isUpdating ? "Saving\u2026" : "Save"}
          </button>
        </div>
      )}
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
        fontSize: "0.5rem",
        lineHeight: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {direction === "up" ? "\u25B2" : "\u25BC"}
    </button>
  );
}

const panelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
  background: "var(--color-surface)",
  borderRight: "1px solid var(--color-border)",
  fontFamily: "var(--font-body)",
  color: "var(--color-text-body)",
  width: 320,
  minWidth: 320,
};

const headerStyle: React.CSSProperties = {
  padding: "0.75rem",
  borderBottom: "1px solid var(--color-border)",
  fontSize: "0.75rem",
  fontWeight: 400,
  letterSpacing: "0.15em",
  color: "var(--color-text-muted)",
  textTransform: "uppercase",
  fontFamily: "var(--font-display)",
};

const zoneLabelStyle: React.CSSProperties = {
  fontSize: "0.62rem",
  fontWeight: 500,
  letterSpacing: "0.1em",
  color: "var(--color-text-dim)",
  textTransform: "uppercase",
  padding: "0.4rem 0.5rem 0.2rem",
};
