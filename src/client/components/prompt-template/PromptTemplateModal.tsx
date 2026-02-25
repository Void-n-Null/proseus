import React, { useState, useRef, useCallback, useMemo, useEffect } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
import { useChatList, useChat } from "../../hooks/useChat.ts";
import { useCharacter } from "../../hooks/useCharacters.ts";
import { usePersona } from "../../hooks/usePersonas.ts";
import { useChatTree } from "../../hooks/useChatTree.ts";
import { useActivePath } from "../../hooks/useActivePath.ts";
import type { Character, Persona, ChatNode } from "../../../shared/types.ts";
import {
  SLOT_META,
  type SlotId,
  type SlotZone,
  type PromptSlot,
} from "../../../shared/prompt-template.ts";
import {
  GripVertical,
  PenLine,
  User,
  MessageSquare,
  Layers,
  Settings2,
  ArrowLeft,
  ChevronDown,
} from "lucide-react";

// ─── Helpers ────────────────────────────────────────────────────────────────

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

const ZONE_LABELS: Record<SlotZone, string> = {
  pre_history: "Pre-History",
  history: "History",
  post_history: "Post-History",
};

const ZONE_ORDER: SlotZone[] = ["pre_history", "history", "post_history"];



const SLOT_PLACEHOLDER: Partial<Record<SlotId, string>> = {
  char_system_prompt: "This slot injects the character card's system_prompt field. It's written by the card creator as a role-level instruction override.",
  char_description: "This slot injects the character card's description field — the core personality, appearance, and background text.",
  char_personality: "This slot injects the character card's personality summary, prepended with \"Personality:\".",
  char_scenario: "This slot injects the character card's scenario or setting text, prepended with \"Scenario:\".",
  persona: "This slot injects your selected persona's name and description, so the AI knows who you are.",
  mes_example: "This slot injects the character card's example dialogue (<START> blocks) as few-shot examples for the AI.",
};

const HISTORY_DETAIL = {
  title: "Chat History",
  description: "The active conversation between you and the character. This slot cannot be disabled — it's the core of the prompt.",
  details: [
    "Messages are injected in chronological order as alternating user/assistant turns.",
    "The most recent messages are always included; older ones are truncated to fit the model's context window.",
    "When \"Flatten History\" is enabled (in Options), all messages are combined into a single user message with Name: prefixes instead of separate role-tagged turns.",
  ],
};

// ─── Live data from active chat ─────────────────────────────────────────────

/** Maps character-sourced slot IDs to the Character field they pull from. */
const SLOT_TO_CHARACTER_FIELD: Partial<Record<SlotId, keyof Character>> = {
  char_system_prompt: "system_prompt",
  char_description: "description",
  char_personality: "personality",
  char_scenario: "scenario",
  mes_example: "mes_example",
  post_history: "post_history_instructions",
};

interface LiveData {
  character: Character | null;
  persona: Persona | null;
  historyPreview: ChatNode[];
  historyTokens: number;
  characterName: string | null;
  personaName: string | null;
  isLoading: boolean;
}

// ─── Slot visual type ───────────────────────────────────────────────────────

type SlotVisualType = "editable" | "character" | "structural";

function getSlotVisualType(id: SlotId): SlotVisualType {
  const meta = SLOT_META[id];
  if (id === "history") return "structural";
  if (meta.hasContent) return "editable";
  return "character";
}

const SLOT_TYPE_ICON: Record<SlotVisualType, React.ReactNode> = {
  editable: <PenLine className="w-4 h-4" />,
  character: <User className="w-4 h-4" />,
  structural: <MessageSquare className="w-4 h-4" />,
};

// ─── Public API ─────────────────────────────────────────────────────────────

export interface PromptTemplateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chatId?: string | null;
}

export default function PromptTemplateModal({
  open,
  onOpenChange,
  chatId,
}: PromptTemplateModalProps) {
  const isMobile = useIsMobile();

  const content = <PromptTemplateContent onClose={() => onOpenChange(false)} isMobile={isMobile} chatId={chatId ?? null} />;

  if (isMobile) {
    return (
      <MobileSlideUpSheet open={open} onClose={() => onOpenChange(false)}>
        {content}
      </MobileSlideUpSheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[1200px] p-0 gap-0 overflow-hidden">
        <div className="h-[780px]">
          {content}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Inner content ──────────────────────────────────────────────────────────

function PromptTemplateContent({
  onClose,
  isMobile,
  chatId,
}: {
  onClose: () => void;
  isMobile: boolean;
  chatId: string | null;
}) {
  const { template, isLoading, updateTemplate, isUpdating } = usePromptTemplate();
  const [localSlots, setLocalSlots] = useState<PromptSlot[] | null>(null);
  const [localFlattenHistory, setLocalFlattenHistory] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<SlotId | null>(null);
  const [activeTab, setActiveTab] = useState<"prompt" | "settings">("prompt");
  const [openZones, setOpenZones] = useState<Set<SlotZone>>(new Set());
  const initializedRef = useRef(false);

  // ── Wire live data from active chat ──────────────────────────
  // Chain: chatId → chatList (to get character_id) → character
  //        chatId → chat (to get persona_id) → persona
  //        chatId → chatTree + activePath (for history preview)
  const { data: chatListData } = useChatList();
  const chatListItem = useMemo(
    () => chatListData?.chats.find((c) => c.id === chatId) ?? null,
    [chatListData, chatId],
  );
  const characterId = chatListItem?.character_id ?? null;

  const { data: characterData, isLoading: isCharLoading } = useCharacter(characterId);
  const character = characterData?.character ?? null;

  const { data: chatData, isLoading: isChatLoading } = useChat(chatId);
  const personaId = chatData?.chat.persona_id ?? null;

  const { data: personaData, isLoading: isPersonaLoading } = usePersona(personaId);
  const persona = personaData?.persona ?? null;

  const { data: treeData } = useChatTree(chatId);
  const activePath = useActivePath(treeData?.nodes, treeData?.rootNodeId);

  const liveData: LiveData = useMemo(() => {
    const allNodes = activePath?.nodes ?? [];
    const historyTokens = allNodes.reduce(
      (sum, n) => sum + (n.message ? estimateTokens(n.message) : 0),
      0,
    );
    return {
      character,
      persona,
      historyPreview: allNodes.slice(0, 3),
      historyTokens,
      characterName: character?.name ?? chatListItem?.character_name ?? null,
      personaName: persona?.name ?? null,
      isLoading: isCharLoading || isChatLoading || isPersonaLoading,
    };
  }, [character, persona, activePath, isCharLoading, isChatLoading, isPersonaLoading, chatListItem]);

  if (template && !initializedRef.current) {
    initializedRef.current = true;
    setLocalSlots(template.slots.map((s) => ({ ...s })));
    setLocalFlattenHistory(template.flattenHistory ?? false);
  }

  const slots = localSlots ?? [];

  const isDirty = (() => {
    if (!template || !localSlots) return false;
    if ((template.flattenHistory ?? false) !== localFlattenHistory) return true;
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

  // ── Token budget ──────────────────────────────────────────────
  const totalTokens = useMemo(() => {
    return slots.reduce((sum, s) => {
      if (!s.enabled) return sum;
      const meta = SLOT_META[s.id];

      // Editable slots: count user-entered content
      if (meta.hasContent && s.content) {
        return sum + estimateTokens(s.content);
      }

      // History: count all messages in the active path
      if (s.id === "history") {
        return sum + liveData.historyTokens;
      }

      // Persona slot
      if (s.id === "persona" && liveData.persona) {
        let text = "";
        if (liveData.persona.name) text += liveData.persona.name;
        if (liveData.persona.prompt) text += " " + liveData.persona.prompt;
        return text.trim() ? sum + estimateTokens(text) : sum;
      }

      // Character-sourced slots
      const field = SLOT_TO_CHARACTER_FIELD[s.id];
      if (field && liveData.character) {
        const value = liveData.character[field];
        if (typeof value === "string" && value.trim()) {
          return sum + estimateTokens(value);
        }
      }

      return sum;
    }, 0);
  }, [slots, liveData]);

  /** Per-slot token count and effective-emptiness for card display. */
  const slotInfo = useMemo(() => {
    const info = new Map<SlotId, { tokens: number; empty: boolean }>();
    for (const s of slots) {
      let tokens = 0;
      let empty = false;
      const meta = SLOT_META[s.id];

      if (meta.hasContent) {
        // Editable slot
        tokens = s.content?.trim() ? estimateTokens(s.content) : 0;
        empty = !s.content?.trim();
      } else if (s.id === "history") {
        tokens = liveData.historyTokens;
        empty = tokens === 0;
      } else if (s.id === "persona") {
        if (liveData.persona) {
          let text = "";
          if (liveData.persona.name) text += liveData.persona.name;
          if (liveData.persona.prompt) text += " " + liveData.persona.prompt;
          tokens = text.trim() ? estimateTokens(text) : 0;
        }
        empty = tokens === 0;
      } else {
        const field = SLOT_TO_CHARACTER_FIELD[s.id];
        if (field && liveData.character) {
          const value = liveData.character[field];
          if (typeof value === "string" && value.trim()) {
            tokens = estimateTokens(value);
          }
        }
        empty = tokens === 0;
      }

      info.set(s.id, { tokens, empty });
    }
    return info;
  }, [slots, liveData]);

  const enabledCount = useMemo(
    () => slots.filter((s) => s.enabled).length,
    [slots],
  );

  // The currently selected slot's data
  const selectedSlotData = useMemo(
    () => (selectedSlot ? slots.find((s) => s.id === selectedSlot) ?? null : null),
    [slots, selectedSlot],
  );

  // ── Handlers ──────────────────────────────────────────────────
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

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setLocalSlots((prev) => {
      if (!prev) return null;
      const oldIndex = prev.findIndex((s) => s.id === active.id);
      const newIndex = prev.findIndex((s) => s.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;

      const slot = prev[oldIndex];
      if (!slot || SLOT_META[slot.id].zone !== "pre_history") return prev;
      const targetSlot = prev[newIndex];
      if (!targetSlot || SLOT_META[targetSlot.id].zone !== "pre_history") return prev;

      return arrayMove(prev, oldIndex, newIndex);
    });
  }, []);

  // ── Auto-save: debounce 400ms, flush on unmount ─────────────
  const pendingSave = useRef<{ slots: PromptSlot[]; flattenHistory: boolean } | null>(null);

  useEffect(() => {
    if (!isDirty || !localSlots) {
      pendingSave.current = null;
      return;
    }
    pendingSave.current = { slots: localSlots, flattenHistory: localFlattenHistory };
    const timer = setTimeout(() => {
      updateTemplate({ slots: localSlots, flattenHistory: localFlattenHistory });
      pendingSave.current = null;
    }, 400);
    return () => clearTimeout(timer);
  }, [isDirty, localSlots, localFlattenHistory, updateTemplate]);

  // Flush any unsaved changes when the component unmounts (e.g. modal closes)
  useEffect(() => {
    return () => {
      if (pendingSave.current) {
        updateTemplate(pendingSave.current);
      }
    };
  }, [updateTemplate]);

  const handleSelectSlot = useCallback((id: SlotId) => {
    setSelectedSlot((prev) => (prev === id ? null : id));
  }, []);

  // ── Slots grouped by zone ──────────────────────────────────────
  const slotsByZone = useMemo(() => {
    const grouped: Record<SlotZone, PromptSlot[]> = {
      pre_history: [],
      history: [],
      post_history: [],
    };
    for (const slot of slots) {
      const zone = SLOT_META[slot.id].zone;
      grouped[zone].push(slot);
    }
    return grouped;
  }, [slots]);

  const toggleZone = useCallback((zone: SlotZone) => {
    setOpenZones((prev) => {
      const next = new Set(prev);
      if (next.has(zone)) next.delete(zone);
      else next.add(zone);
      return next;
    });
  }, []);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  return (
    <div className="flex flex-col h-full font-body text-text-body bg-surface-sunken rounded-2xl">
      {/* ── Header ── */}
      {isMobile ? (
        <div className="flex flex-col space-y-1.5 px-4 pt-4 pb-0">
          <h2 className="text-foreground text-lg font-semibold leading-none tracking-tight">
            Prompt Template
          </h2>
          <p className="text-text-muted text-sm">
            Configure the prompt assembly order and content.
          </p>
        </div>
      ) : (
        <DialogHeader className="px-6 pr-12 pt-5 pb-0">
          <DialogTitle className="text-foreground text-lg font-semibold">
            Prompt Template
          </DialogTitle>
          <DialogDescription className="text-text-muted text-sm">
            Configure the prompt assembly order and content.
          </DialogDescription>
        </DialogHeader>
      )}

      {/* ── Token budget bar ── */}
      <div className="flex items-center gap-3 px-4 sm:px-6 pt-3 sm:pt-4 pb-2 shrink-0">
        <TokenBudgetBar enabledCount={enabledCount} totalTokens={totalTokens} />
      </div>

      <div className="border-b border-white/5 mx-auto w-full max-w-[98%]" />

      {/* ── Body ── */}
      {isLoading || !template ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            <span className="text-sm text-text-muted">Loading template...</span>
          </div>
        </div>
      ) : isMobile ? (
        /* ── Mobile: slot list OR detail view ── */
        <div className="flex-1 min-h-0 flex flex-col">
          {selectedSlot && selectedSlotData ? (
            /* Mobile detail view — full screen takeover */
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="flex items-center gap-2 px-3 pt-2 pb-1 shrink-0">
                <button
                  onClick={() => setSelectedSlot(null)}
                  className="flex items-center gap-1 px-2 h-8 rounded-2xl text-xs font-medium text-text-muted border border-border-subtle bg-background hover:bg-surface-hover hover:text-text-body transition-all duration-100 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3">
                <SlotDetailPanel
                  slot={selectedSlotData}
                  onContentChange={handleContentChange}
                  flattenHistory={localFlattenHistory}
                  liveData={liveData}
                />
              </div>
            </div>
          ) : (
            /* Mobile slot list with accordions */
            <>
              <TopTabs active={activeTab} onSelect={setActiveTab} />
              <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3">
                {activeTab === "settings" ? (
                  <OptionsPanel
                    flattenHistory={localFlattenHistory}
                    onToggleFlatten={() => setLocalFlattenHistory((v) => !v)}
                  />
                ) : (
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <div className="flex flex-col gap-2 pt-1">
                      {ZONE_ORDER.map((zone) => (
                         <ZoneAccordion
                          key={zone}
                          zone={zone}
                          open={openZones.has(zone)}
                          onToggle={() => toggleZone(zone)}
                          slots={slotsByZone[zone]}
                          selectedSlot={selectedSlot}
                          onToggleSlot={handleToggle}
                          onSelectSlot={handleSelectSlot}
                          slotInfo={slotInfo}
                        />
                      ))}
                    </div>
                  </DndContext>
                )}

              </div>
            </>
          )}
        </div>
      ) : (
        /* ── Desktop: slot list (left) + detail panel (right) ── */
        <div className="flex-1 flex min-h-0">
          <div className="w-[440px] min-w-[440px] border-r border-white/5 flex flex-col">
            <TopTabs active={activeTab} onSelect={setActiveTab} />
            <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4">
              {activeTab === "settings" ? (
                <OptionsPanel
                  flattenHistory={localFlattenHistory}
                  onToggleFlatten={() => setLocalFlattenHistory((v) => !v)}
                />
              ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <div className="flex flex-col gap-2 pt-1">
                    {ZONE_ORDER.map((zone) => (
                      <ZoneAccordion
                        key={zone}
                        zone={zone}
                        open={openZones.has(zone)}
                        onToggle={() => toggleZone(zone)}
                        slots={slotsByZone[zone]}
                        selectedSlot={selectedSlot}
                        onToggleSlot={handleToggle}
                        onSelectSlot={handleSelectSlot}
                        slotInfo={slotInfo}
                      />
                    ))}
                  </div>
                </DndContext>
              )}
            </div>
          </div>

          {/* Right: detail panel */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {selectedSlotData ? (
              <SlotDetailPanel
                slot={selectedSlotData}
                onContentChange={handleContentChange}
                flattenHistory={localFlattenHistory}
                liveData={liveData}
              />
            ) : (
              <EmptyDetailPane />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Token budget bar ───────────────────────────────────────────────────────

function TokenBudgetBar({
  enabledCount,
  totalTokens,
}: {
  enabledCount: number;
  totalTokens: number;
}) {
  const stats = [
    { label: "Slots", value: String(enabledCount) },
    { label: "Est. Tokens", value: `~${totalTokens.toLocaleString()}` },
  ];

  return (
    <div className="flex-1 h-10 flex items-center rounded-2xl border border-border bg-[oklch(0.15_0.005_300)]">
      {stats.map((stat, i) => (
        <React.Fragment key={stat.label}>
          {i > 0 && <div className="w-px h-5 bg-border shrink-0" />}
          <div className="flex-1 flex items-center justify-center gap-1.5 px-2">
            <span className="text-[10px] uppercase tracking-widest text-text-dim font-medium whitespace-nowrap">
              {stat.label}
            </span>
            <span className="text-xs font-mono font-medium text-text-body whitespace-nowrap">
              {stat.value}
            </span>
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

// ─── Top-level tabs (Prompt / Settings) ─────────────────────────────────────

const TOP_TABS: { id: "prompt" | "settings"; label: string; icon: React.ReactNode }[] = [
  { id: "prompt", label: "Prompt", icon: <Layers className="w-3.5 h-3.5" /> },
  { id: "settings", label: "Settings", icon: <Settings2 className="w-3.5 h-3.5" /> },
];

function TopTabs({
  active,
  onSelect,
}: {
  active: "prompt" | "settings";
  onSelect: (tab: "prompt" | "settings") => void;
}) {
  return (
    <div className="flex items-center gap-1.5 px-4 pt-3 pb-2 shrink-0">
      {TOP_TABS.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            onClick={() => onSelect(tab.id)}
            className={[
              "flex items-center gap-1.5 px-2.5 h-8 rounded-2xl text-xs font-medium transition-all duration-100 cursor-pointer border",
              isActive
                ? "bg-surface-hover text-foreground border-border"
                : "bg-background text-text-muted border-border-subtle hover:bg-surface-hover hover:text-text-body",
            ].join(" ")}
          >
            {tab.icon}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Zone accordion ─────────────────────────────────────────────────────────

const ZONE_DESCRIPTIONS: Record<SlotZone, string> = {
  pre_history: "System context injected before the conversation",
  history: "The active chat messages",
  post_history: "Instructions injected after the conversation",
};

function ZoneAccordion({
  zone,
  open,
  onToggle,
  slots,
  selectedSlot,
  onToggleSlot,
  onSelectSlot,
  slotInfo,
}: {
  zone: SlotZone;
  open: boolean;
  onToggle: () => void;
  slots: PromptSlot[];
  selectedSlot: SlotId | null;
  onToggleSlot: (id: SlotId) => void;
  onSelectSlot: (id: SlotId) => void;
  slotInfo: Map<SlotId, { tokens: number; empty: boolean }>;
}) {
  const enabledCount = slots.filter((s) => s.enabled).length;
  const isDraggable = zone === "pre_history";

  return (
    <div>
      {/* Zone section header — flat line, not a card */}
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "12px 6px 8px",
          cursor: "pointer",
          background: "transparent",
          border: "none",
          borderBottom: `1px solid ${ROW_C.divider}`,
        }}
      >
        <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
          <span style={{
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.04em",
            textTransform: "uppercase" as const,
            color: ROW_C.textMid,
            lineHeight: 1.2,
            display: "block",
          }}>
            {ZONE_LABELS[zone]}
          </span>
          <span style={{
            fontSize: 11,
            color: ROW_C.textGhost,
            lineHeight: 1.3,
            display: "block",
            marginTop: 2,
          }}>
            {ZONE_DESCRIPTIONS[zone]}
          </span>
        </div>
        <span style={{
          fontSize: 10,
          fontFamily: "monospace",
          color: ROW_C.textGhost,
          flexShrink: 0,
        }}>
          {enabledCount}/{slots.length}
        </span>
        <ChevronDown
          className="shrink-0"
          style={{
            width: 14, height: 14,
            color: ROW_C.textGhost,
            transition: "transform 0.2s",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </button>

      {/* Slot rows — flush, no extra wrapper chrome */}
      {open && (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {isDraggable ? (
            <SortableContext items={slots.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              {slots.map((slot) => {
                const info = slotInfo.get(slot.id);
                return (
                  <SortableSlotCard
                    key={slot.id}
                    slot={slot}
                    isSelected={selectedSlot === slot.id}
                    isDraggable
                    onToggle={onToggleSlot}
                    onSelect={onSelectSlot}
                    tokens={info?.tokens ?? 0}
                    isEmpty={info?.empty ?? false}
                  />
                );
              })}
            </SortableContext>
          ) : (
            slots.map((slot) => {
              const info = slotInfo.get(slot.id);
              return (
                <SortableSlotCard
                  key={slot.id}
                  slot={slot}
                  isSelected={selectedSlot === slot.id}
                  isDraggable={false}
                  onToggle={onToggleSlot}
                  onSelect={onSelectSlot}
                  tokens={info?.tokens ?? 0}
                  isEmpty={info?.empty ?? false}
                />
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ─── Toggle switch (Card12 pill toggle) ─────────────────────────────────────
//
// 36×20 pill inside a 52×48 invisible hit-area button (≥44px Apple HIG).
// oklch colors matching Card12 design tokens.

const TOGGLE_C = {
  on:       "oklch(0.55 0.15 260)",
  off:      "oklch(0.24 0.005 300)",
  dimmed:   "oklch(0.25 0.005 300)",
  thumbOn:  "oklch(0.96 0.005 300)",
  thumbOff: "oklch(0.42 0.005 300)",
} as const;

function Toggle({
  enabled,
  disabled,
  dimmed,
  onClick,
}: {
  enabled: boolean;
  disabled?: boolean;
  /** Enabled but content is empty — show a muted/gray toggle instead of the primary color */
  dimmed?: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  const trackColor = disabled
    ? TOGGLE_C.off
    : enabled
      ? dimmed ? TOGGLE_C.dimmed : TOGGLE_C.on
      : TOGGLE_C.off;

  const thumbColor = enabled ? TOGGLE_C.thumbOn : TOGGLE_C.thumbOff;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 52, height: 48,
        border: "none",
        background: "transparent",
        flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <div style={{
        width: 36, height: 20, borderRadius: 10,
        background: trackColor,
        position: "relative",
        transition: "background 0.2s",
      }}>
        <div style={{
          width: 14, height: 14, borderRadius: 14,
          background: dimmed && enabled ? `${thumbColor}80` : thumbColor,
          position: "absolute", top: 3,
          left: enabled ? 19 : 3,
          transition: "left 0.2s, background 0.2s",
          boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
        }} />
      </div>
    </button>
  );
}

// ─── Card12 design tokens ───────────────────────────────────────────────────

const ROW_C = {
  rowBg:      "transparent",
  hoverBg:    "oklch(0.17 0.005 300)",
  selectedBg: "oklch(0.19 0.010 280 / 0.5)",
  divider:    "oklch(1 0 0 / 0.06)",
  accent:     "oklch(0.55 0.15 260)",
  textHi:     "oklch(0.90 0.005 300)",
  textMid:    "oklch(0.62 0.005 300)",
  textLo:     "oklch(0.42 0.005 300)",
  textGhost:  "oklch(0.30 0.005 300)",
} as const;

// ─── Sortable slot card (Card12 — flat row, pill right) ─────────────────────

function SortableSlotCard({
  slot,
  isSelected,
  isDraggable,
  onToggle,
  onSelect,
  tokens,
  isEmpty,
}: {
  slot: PromptSlot;
  isSelected: boolean;
  isDraggable: boolean;
  onToggle: (id: SlotId) => void;
  onSelect: (id: SlotId) => void;
  tokens: number;
  isEmpty: boolean;
}) {
  const meta = SLOT_META[slot.id];
  const visualType = getSlotVisualType(slot.id);
  /** Enabled but nothing to inject — show toggle in a muted/gray state */
  const enabledButEmpty = slot.enabled && isEmpty && !meta.required;
  const [hovered, setHovered] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: slot.id,
    disabled: !isDraggable,
  });

  const dndTransform = CSS.Transform.toString(
    transform ? { ...transform, x: 0 } : null,
  );

  // Build row style — flat Card12 design
  const rowStyle: React.CSSProperties = {
    transform: dndTransform ?? undefined,
    transition,
    width: "100%",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 0,
    padding: isDraggable ? "10px 0 10px 4px" : "10px 0 10px 14px",
    background: isDragging
      ? "oklch(0.20 0.01 280)"
      : isSelected
        ? ROW_C.selectedBg
        : hovered
          ? ROW_C.hoverBg
          : ROW_C.rowBg,
    borderBottom: `1px solid ${ROW_C.divider}`,
    borderLeft: isSelected ? `2px solid ${ROW_C.accent}` : "2px solid transparent",
    outline: "none",
    ...(isDragging && {
      boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
      zIndex: 50,
      position: "relative" as const,
      borderRadius: 6,
      borderBottom: "none",
    }),
  };

  return (
    <div
      ref={setNodeRef}
      role="button"
      tabIndex={0}
      style={rowStyle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onSelect(slot.id)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(slot.id); } }}
    >
      {/* Drag handle — only for pre_history zone items */}
      {isDraggable && (
        <div
          style={{
            touchAction: "none",
            padding: 4,
            marginRight: 6,
            borderRadius: 4,
            color: ROW_C.textGhost,
            cursor: "grab",
            display: "flex",
            alignItems: "center",
          }}
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="w-4 h-4" />
        </div>
      )}

      {/* Name + metadata (stacked two-line) */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14,
          fontWeight: 500,
          color: slot.enabled ? ROW_C.textHi : ROW_C.textLo,
          transition: "color 0.1s",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {meta.label}
        </div>
        <div style={{
          fontSize: 11,
          color: ROW_C.textLo,
          marginTop: 3,
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}>
          {tokens > 0 ? (
            <span style={{ fontFamily: "monospace" }}>~{tokens.toLocaleString()} tokens</span>
          ) : (
            <span style={{ color: ROW_C.textGhost, fontStyle: "italic" }}>empty</span>
          )}
          <span style={{ color: ROW_C.textGhost }}>&middot;</span>
          <span>{visualType}</span>
        </div>
      </div>

      {/* Pill toggle — right side, inside its own click zone */}
      <div onClick={(e) => e.stopPropagation()}>
        <Toggle
          enabled={slot.enabled}
          disabled={meta.required}
          dimmed={enabledButEmpty}
          onClick={(e) => {
            e.stopPropagation();
            if (!meta.required) onToggle(slot.id);
          }}
        />
      </div>
    </div>
  );
}

// ─── Slot detail panel (right side — the workspace) ─────────────────────────

function SlotDetailPanel({
  slot,
  onContentChange,
  flattenHistory,
  liveData,
}: {
  slot: PromptSlot;
  onContentChange: (id: SlotId, content: string) => void;
  flattenHistory: boolean;
  liveData: LiveData;
}) {
  const meta = SLOT_META[slot.id];
  const visualType = getSlotVisualType(slot.id);

  // Resolve live content for character-sourced and persona slots
  const liveContent = useMemo(() => {
    if (slot.id === "persona") {
      if (!liveData.persona) return null;
      const parts: string[] = [];
      if (liveData.persona.name) parts.push(`Name: ${liveData.persona.name}`);
      if (liveData.persona.prompt) parts.push(liveData.persona.prompt);
      return parts.length > 0 ? parts.join("\n\n") : null;
    }
    const field = SLOT_TO_CHARACTER_FIELD[slot.id];
    if (!field || !liveData.character) return null;
    const value = liveData.character[field];
    if (typeof value !== "string" || !value.trim()) return null;
    return value;
  }, [slot.id, liveData.character, liveData.persona]);

  return (
    <div className="flex flex-col h-full px-6 py-5">
      {/* Slot identity header */}
      <div className="flex items-center gap-3 mb-4 shrink-0">
        <div className="shrink-0 w-11 h-11 rounded-xl flex items-center justify-center bg-[oklch(0.50_0_0/0.06)] border border-[oklch(0.50_0_0/0.1)] text-text-dim">
          {SLOT_TYPE_ICON[visualType]}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-foreground leading-snug">
              {meta.label}
            </h3>
            {meta.hasContent && (
              <span className="shrink-0 text-[10px] font-semibold tracking-wide uppercase px-1.5 py-0.5 rounded bg-primary/15 text-primary leading-none">
                Editable
              </span>
            )}
          </div>
          <p className="text-xs text-text-dim mt-0.5">
            {meta.description}
          </p>
        </div>
      </div>

      <div className="border-t border-border mb-4 shrink-0" />

      {/* Content area — depends on slot type */}
      {visualType === "editable" ? (
        /* ── Editable slot: full textarea ── */
        <div className="flex-1 min-h-0 flex flex-col">
          <textarea
            value={slot.content ?? ""}
            onChange={(e) => onContentChange(slot.id, e.target.value)}
            className="flex-1 w-full resize-none bg-surface-deep text-text-body border border-border rounded-2xl px-4 py-3 text-sm font-body leading-relaxed outline-none transition-all duration-150 focus:border-primary/25 focus:shadow-[0_0_0_1px_oklch(0.70_0.15_280/0.08)] min-h-0"
            placeholder={`Enter ${meta.label.toLowerCase()} content...`}
          />
          <div className="flex items-center justify-between mt-3 shrink-0">
            {meta.hasMacros && (
              <div className="text-xs text-text-dim flex items-center gap-2">
                <span className="font-mono">{`{{char}}`}</span>
                <span className="text-text-dim/40">&bull;</span>
                <span className="font-mono">{`{{user}}`}</span>
                <span className="text-text-dim/60 ml-1">macros available</span>
              </div>
            )}
            {slot.content != null && slot.content.length > 0 && (
              <span className="text-xs font-mono text-text-dim ml-auto">
                ~{estimateTokens(slot.content)} tokens
              </span>
            )}
          </div>
        </div>
      ) : visualType === "structural" ? (
        /* ── History slot: informational + live preview ── */
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl bg-surface-hover border border-border px-5 py-4">
            <p className="text-sm text-text-body leading-relaxed">
              {HISTORY_DETAIL.description}
            </p>
          </div>

          {/* Live history preview */}
          {liveData.historyPreview.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-[10px] uppercase tracking-widest text-text-dim font-medium px-1">
                Recent Messages
              </span>
              <div className="flex flex-col gap-1.5">
                {liveData.historyPreview.map((node) => (
                  <div
                    key={node.id}
                    className="rounded-xl bg-[oklch(0.15_0.005_300)] border border-border px-4 py-2.5 flex items-start gap-2.5"
                  >
                    <div className={[
                      "shrink-0 w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold mt-0.5",
                      node.is_bot
                        ? "bg-[oklch(0.55_0.15_280/0.15)] text-[oklch(0.75_0.15_280)]"
                        : "bg-[oklch(0.55_0.15_140/0.15)] text-[oklch(0.75_0.15_140)]",
                    ].join(" ")}>
                      {node.is_bot ? "A" : "U"}
                    </div>
                    <p className="text-xs text-text-muted leading-relaxed line-clamp-2 min-w-0">
                      {node.message || <span className="italic text-text-dim">Empty message</span>}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2.5">
            {HISTORY_DETAIL.details.map((detail, i) => (
              <div key={i} className="flex items-start gap-2.5 px-1">
                <span className="text-[9px] text-text-dim/60 mt-1.5">&bull;</span>
                <p className="text-xs text-text-dim leading-relaxed">
                  {detail}
                </p>
              </div>
            ))}
          </div>
          {flattenHistory && (
            <div className="rounded-2xl bg-primary/[0.04] border border-primary/10 px-4 py-3">
              <p className="text-xs text-text-muted">
                <span className="font-semibold text-primary">Flatten History</span> is currently enabled.
                Messages will be combined into a single user turn with Name: prefixes.
              </p>
            </div>
          )}
          {liveData.historyTokens > 0 && (
            <div className="flex items-center justify-end px-1">
              <span className="text-xs font-mono text-text-dim">
                ~{liveData.historyTokens.toLocaleString()} tokens (full history)
              </span>
            </div>
          )}
        </div>
      ) : (
        /* ── Character-sourced / persona slot: live content or placeholder ── */
        <div className="flex flex-col gap-4">
          {liveData.isLoading ? (
            /* Loading state */
            <div className="rounded-2xl bg-surface-hover border border-border px-5 py-6 flex items-center justify-center">
              <div className="flex items-center gap-2.5">
                <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                <span className="text-xs text-text-dim">Loading content...</span>
              </div>
            </div>
          ) : liveContent ? (
            /* Live content from character/persona */
            <>
              {/* Source badge */}
              <div className="flex items-center gap-2 px-1">
                <span className="text-[10px] uppercase tracking-widest text-text-dim font-medium">
                  {slot.id === "persona" ? "Active Persona" : "From Character Card"}
                </span>
                {slot.id === "persona" && liveData.personaName && (
                  <span className="text-[10px] font-medium text-text-muted px-1.5 py-0.5 rounded bg-surface-hover border border-border leading-none">
                    {liveData.personaName}
                  </span>
                )}
                {slot.id !== "persona" && liveData.characterName && (
                  <span className="text-[10px] font-medium text-text-muted px-1.5 py-0.5 rounded bg-surface-hover border border-border leading-none">
                    {liveData.characterName}
                  </span>
                )}
              </div>

              {/* Content preview */}
              <div className="rounded-2xl bg-[oklch(0.15_0.005_300)] border border-border px-5 py-4 max-h-[400px] overflow-y-auto">
                <p className="text-sm text-text-body/80 leading-relaxed whitespace-pre-wrap break-words">
                  {liveContent}
                </p>
              </div>

              {/* Token estimate for the live content */}
              <div className="flex items-center justify-between px-1">
                <span className="text-xs text-text-dim">
                  Read-only — edit the {slot.id === "persona" ? "persona" : "character card"} directly to change this.
                </span>
                <span className="text-xs font-mono text-text-dim">
                  ~{estimateTokens(liveContent).toLocaleString()} tokens
                </span>
              </div>
            </>
          ) : slot.id === "persona" && !liveData.persona ? (
            /* No persona selected */
            <div className="rounded-2xl border border-dashed border-border bg-surface px-5 py-4">
              <p className="text-sm text-text-muted leading-relaxed">
                No persona is selected for this chat.
              </p>
              <p className="text-xs text-text-dim mt-2 leading-relaxed">
                Select a persona to inject your identity into the prompt. This slot will be skipped during generation until one is set.
              </p>
            </div>
          ) : slot.id !== "persona" && !liveData.character ? (
            /* No character attached */
            <div className="rounded-2xl border border-dashed border-border bg-surface px-5 py-4">
              <p className="text-sm text-text-muted leading-relaxed">
                No character is attached to this chat.
              </p>
              <p className="text-xs text-text-dim mt-2 leading-relaxed">
                This slot will be skipped during generation. Start a chat from a character card to populate it.
              </p>
            </div>
          ) : (
            /* Character/persona exists but this specific field is empty */
            <>
              <div className="rounded-2xl bg-surface-hover border border-border px-5 py-4">
                <p className="text-sm text-text-body leading-relaxed">
                  {SLOT_PLACEHOLDER[slot.id] ?? `This slot pulls content from the ${slot.id === "persona" ? "active persona" : "character card's " + meta.label.toLowerCase() + " field"} at generation time.`}
                </p>
              </div>
              <div className="flex items-start gap-2.5 px-1">
                <span className="text-[9px] text-text-dim/60 mt-1.5">&bull;</span>
                <p className="text-xs text-text-dim leading-relaxed">
                  This field is empty on the {slot.id === "persona" ? "persona" : "character card"}. The slot will be skipped during generation.
                </p>
              </div>
            </>
          )}

          {!slot.enabled && (
            <div className="rounded-2xl border border-dashed border-border bg-surface px-4 py-3">
              <p className="text-xs text-text-dim">
                This slot is currently <span className="font-semibold text-text-muted">disabled</span> and will not be included in the prompt.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Empty state for detail panel ───────────────────────────────────────────

function EmptyDetailPane() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-8 py-16">
      <div className="shrink-0 w-11 h-11 rounded-xl flex items-center justify-center bg-[oklch(0.50_0_0/0.06)] border border-[oklch(0.50_0_0/0.1)] mb-3">
        <Layers className="w-5 h-5 text-text-dim" />
      </div>
      <p className="text-sm font-semibold text-text-muted">
        Select a slot
      </p>
      <p className="text-xs text-text-dim mt-1 text-center max-w-[240px]">
        Click a slot on the left to view its details or edit its content.
      </p>
    </div>
  );
}

// ─── Options panel ──────────────────────────────────────────────────────────

function OptionsPanel({
  flattenHistory,
  onToggleFlatten,
}: {
  flattenHistory: boolean;
  onToggleFlatten: () => void;
}) {
  return (
    <div className="pt-2 flex flex-col gap-2">
      <div
        className={[
          "flex items-center gap-3 px-4 py-3 rounded-2xl cursor-pointer transition-[background-color,border-color,box-shadow] duration-150",
          "bg-[oklch(0.18_0.007_300)] border border-border",
          "hover:bg-surface-raised hover:border-[oklch(1_0_0/0.14)] hover:shadow-[0_2px_10px_-4px_rgba(0,0,0,0.2)]",
        ].join(" ")}
        onClick={onToggleFlatten}
      >
        <Toggle
          enabled={flattenHistory}
          onClick={(e) => { e.stopPropagation(); onToggleFlatten(); }}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={[
                "text-sm font-medium leading-tight",
                flattenHistory ? "text-text-body" : "text-text-dim",
              ].join(" ")}
            >
              Flatten History
            </span>
          </div>
          <span className="text-xs text-text-dim mt-0.5 block leading-snug">
            Combine all messages into a single user turn with Name: prefixes.
          </span>
        </div>
      </div>

      <div className="px-4 pt-4 border-t border-border mt-2">
        <p className="text-xs text-text-dim/40 italic">
          More options will appear here as they become available.
        </p>
      </div>
    </div>
  );
}
