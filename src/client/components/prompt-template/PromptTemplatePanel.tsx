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
      <div className="flex flex-col h-full bg-surface border-r border-border font-body text-text-body w-[320px] min-w-[320px]">
        <div className="p-3 border-b border-border text-[0.75rem] font-normal tracking-[0.15em] text-text-muted uppercase font-display">
          Prompt Template
        </div>
        <div className="flex items-center justify-center flex-1 text-text-dim text-[0.82rem]">
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
    <div className="flex flex-col h-full bg-surface border-r border-border font-body text-text-body w-[320px] min-w-[320px]">
      <div className="p-3 border-b border-border text-[0.75rem] font-normal tracking-[0.15em] text-text-muted uppercase font-display">
        Prompt Template
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {slotsByZone.map(({ zone, label, items }) => (
          <div key={zone} className="mb-3">
            <div className="text-[0.62rem] font-medium tracking-[0.1em] text-text-dim uppercase px-2 pt-[0.4rem] pb-[0.2rem]">
              {label}
            </div>
            <div className="flex flex-col gap-[2px]">
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
                      className="flex items-center gap-2 py-[0.45rem] px-2 rounded-sm transition-[background] duration-[120ms]"
                      style={{
                        /* intentionally dynamic */ cursor: meta.hasContent ? "pointer" : "default",
                        /* intentionally dynamic */ background: isExpanded
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
                        <div className="flex flex-col gap-px shrink-0">
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
                        <div className="w-4 shrink-0" />
                      )}

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!meta.required) handleToggle(slot.id);
                        }}
                        disabled={meta.required}
                        className="relative shrink-0 border-none w-8 h-[18px] rounded-[9px] transition-[background] duration-150"
                        style={{
                          /* intentionally dynamic */ cursor: meta.required ? "not-allowed" : "pointer",
                          /* intentionally dynamic */ background: slot.enabled
                            ? "var(--color-primary)"
                            : "var(--color-surface-raised)",
                          /* intentionally dynamic */ opacity: meta.required ? 0.6 : 1,
                        }}
                      >
                        <div
                          className="absolute rounded-full bg-text-body w-3 h-3 top-[3px] transition-[left] duration-150"
                          style={{
                            /* intentionally dynamic */ left: slot.enabled ? 17 : 3,
                          }}
                        />
                      </button>

                      <div className="flex-1 min-w-0">
                        <div
                          className="text-[0.78rem] font-normal whitespace-nowrap overflow-hidden text-ellipsis"
                          style={{
                            /* intentionally dynamic */ color: slot.enabled
                              ? "var(--color-text-body)"
                              : "var(--color-text-dim)",
                          }}
                        >
                          {meta.label}
                        </div>
                        <div className="text-[0.65rem] text-text-dim whitespace-nowrap overflow-hidden text-ellipsis mt-px">
                          {meta.description}
                        </div>
                      </div>

                      {meta.hasContent && slot.content != null && slot.content.length > 0 && (
                        <span className="text-[0.62rem] text-text-dim shrink-0 tabular-nums">
                          ~{estimateTokens(slot.content)} tk
                        </span>
                      )}

                      {meta.hasContent && (
                        <span
                          className="text-[0.6rem] text-text-dim shrink-0 transition-transform duration-150"
                          style={{
                            /* intentionally dynamic */ transform: isExpanded
                              ? "rotate(90deg)"
                              : "rotate(0deg)",
                          }}
                        >
                          {"\u25B6"}
                        </span>
                      )}
                    </div>

                    {isExpanded && meta.hasContent && (
                      <div className="pt-1 px-2 pb-2 pl-[2.75rem]">
                        <textarea
                          value={slot.content ?? ""}
                          onChange={(e) =>
                            handleContentChange(slot.id, e.target.value)
                          }
                          rows={5}
                          className="w-full resize-y bg-surface text-text-body border border-border rounded-sm px-2 py-[0.4rem] text-[0.75rem] font-body leading-normal outline-none box-border focus:border-primary"
                        />
                        {meta.hasMacros && (
                          <div className="text-[0.6rem] text-text-dim mt-[0.2rem]">
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
        <div className="py-2 px-3 border-t border-border flex justify-end">
          <button
            onClick={handleSave}
            disabled={isUpdating}
            className="px-4 py-[0.4rem] bg-primary text-background border-none rounded-md text-[0.75rem] font-medium transition-opacity duration-150"
            style={{
              /* intentionally dynamic */ cursor: isUpdating ? "wait" : "pointer",
              /* intentionally dynamic */ opacity: isUpdating ? 0.6 : 1,
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
      className="p-0 border-none bg-transparent text-[0.5rem] leading-none flex items-center justify-center w-4 h-[10px]"
      style={{
        /* intentionally dynamic */ color: disabled ? "var(--color-surface-raised)" : "var(--color-text-dim)",
        /* intentionally dynamic */ cursor: disabled ? "default" : "pointer",
      }}
    >
      {direction === "up" ? "\u25B2" : "\u25BC"}
    </button>
  );
}
