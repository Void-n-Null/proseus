/**
 * Prompt Template — the ordered, configurable list of slots that make up
 * the prompt sent to the AI.
 *
 * Architecture:
 *   Zone 1 (pre_history) — all injected into a single system message before
 *     the chat history. Fully reorderable. Slots with hasContent=true carry
 *     user-editable text; others pull from the character card or persona.
 *
 *   Zone 2 (history) — the active chat path. Not reorderable. Always sits
 *     between pre-history and post-history.
 *
 *   Zone 3 (post_history) — injected after the chat history. Fixed order.
 *     post_history goes as a system message; assistant_prefill is appended
 *     as a partial role:"assistant" message (the model continues from it).
 *
 * Macro substitution (applied server-side to hasContent slots):
 *   {{char}}  → character.name  (or "Character" if no character in chat)
 *   {{user}}  → persona.name    (or "User" if no persona selected)
 */

// ── Slot identifiers ────────────────────────────────────────────

export type SlotId =
  // Zone 1: Pre-history (reorderable)
  | 'main'             // Global instruction prompt (editable text)
  | 'char_system_prompt' // character.system_prompt
  | 'char_description' // character.description
  | 'char_personality' // character.personality
  | 'char_scenario'    // character.scenario
  | 'persona'          // persona.name + persona.prompt
  | 'mes_example'      // character.mes_example (<START> blocks)
  // Zone 2: History (fixed)
  | 'history'
  // Zone 3: Post-history (fixed order)
  | 'post_history'     // character.post_history_instructions
  | 'assistant_prefill'; // Editable text → appended as role:"assistant" message

export type SlotZone = 'pre_history' | 'history' | 'post_history';

// ── Slot metadata ───────────────────────────────────────────────

export interface SlotMeta {
  id: SlotId;
  label: string;
  /** One-line description shown in the UI. */
  description: string;
  zone: SlotZone;
  /**
   * If true, the slot carries user-editable text stored on the PromptSlot
   * itself (e.g. main prompt text, assistant prefill string).
   * If false, content is pulled from the character card / persona at
   * generation time.
   */
  hasContent: boolean;
  /**
   * If true, the slot cannot be disabled (history is always required
   * for coherent generation).
   */
  required?: boolean;
  /**
   * If true, this slot supports {{char}} / {{user}} macro substitution.
   */
  hasMacros?: boolean;
}

export const SLOT_META: Record<SlotId, SlotMeta> = {
  main: {
    id: 'main',
    label: 'Main Prompt',
    description: 'Primary instruction for the AI. Supports {{char}} and {{user}} macros.',
    zone: 'pre_history',
    hasContent: true,
    hasMacros: true,
  },
  char_system_prompt: {
    id: 'char_system_prompt',
    label: 'Character System Prompt',
    description: "The character card's own system prompt override field.",
    zone: 'pre_history',
    hasContent: false,
  },
  char_description: {
    id: 'char_description',
    label: 'Description',
    description: 'Character description field from the card.',
    zone: 'pre_history',
    hasContent: false,
  },
  char_personality: {
    id: 'char_personality',
    label: 'Personality',
    description: 'Character personality summary (prepended with "Personality: ").',
    zone: 'pre_history',
    hasContent: false,
  },
  char_scenario: {
    id: 'char_scenario',
    label: 'Scenario',
    description: 'Character scenario or setting (prepended with "Scenario: ").',
    zone: 'pre_history',
    hasContent: false,
  },
  persona: {
    id: 'persona',
    label: 'Persona',
    description: "The user's persona name and description.",
    zone: 'pre_history',
    hasContent: false,
  },
  mes_example: {
    id: 'mes_example',
    label: 'Example Dialogue',
    description: 'Few-shot example conversations from the character card (<START> blocks).',
    zone: 'pre_history',
    hasContent: false,
  },
  history: {
    id: 'history',
    label: 'Chat History',
    description: 'The active conversation history.',
    zone: 'history',
    hasContent: false,
    required: true,
  },
  post_history: {
    id: 'post_history',
    label: 'After-History Instructions',
    description: 'Character post-history instructions, injected after the chat (the jailbreak / UJB slot).',
    zone: 'post_history',
    hasContent: false,
  },
  assistant_prefill: {
    id: 'assistant_prefill',
    label: 'Assistant Prefill',
    description:
      "Text prepended to the AI's response. Sent as a partial assistant message — the model continues from this prefix. The prefix is hidden in the chat UI.",
    zone: 'post_history',
    hasContent: true,
    hasMacros: true,
  },
};

// ── Runtime template ────────────────────────────────────────────

/** A single slot in the active prompt template. */
export interface PromptSlot {
  id: SlotId;
  enabled: boolean;
  /**
   * User-editable text content. Only present (and meaningful) when
   * SLOT_META[id].hasContent is true. Undefined = use the default.
   */
  content?: string;
}

/** The full prompt template: an ordered list of slots. */
export interface PromptTemplate {
  slots: PromptSlot[];
}

// ── Defaults ────────────────────────────────────────────────────

export const DEFAULT_MAIN_PROMPT =
  "Write {{char}}'s next reply in a fictional chat between {{char}} and {{user}}.";

/**
 * The default template mirrors SillyTavern's out-of-the-box prompt order.
 * mes_example and assistant_prefill are off by default — users opt in.
 */
export const DEFAULT_PROMPT_TEMPLATE: PromptTemplate = {
  slots: [
    { id: 'main', enabled: true, content: DEFAULT_MAIN_PROMPT },
    { id: 'char_system_prompt', enabled: true },
    { id: 'char_description', enabled: true },
    { id: 'char_personality', enabled: true },
    { id: 'char_scenario', enabled: true },
    { id: 'persona', enabled: true },
    { id: 'mes_example', enabled: false },
    { id: 'history', enabled: true },
    { id: 'post_history', enabled: true },
    { id: 'assistant_prefill', enabled: false, content: '' },
  ],
};

// ── Helpers ─────────────────────────────────────────────────────

/**
 * Returns a fully-populated PromptTemplate by merging a persisted template
 * with the canonical defaults. Ensures all slots are present even if new
 * slots were added after the user's template was saved.
 */
export function mergeWithDefaults(saved: PromptTemplate): PromptTemplate {
  const savedById = new Map(saved.slots.map((s) => [s.id, s]));

  // Start from the default order, applying saved slot state where present.
  const mergedSlots: PromptSlot[] = DEFAULT_PROMPT_TEMPLATE.slots.map((defaultSlot) => {
    const savedSlot = savedById.get(defaultSlot.id);
    return savedSlot ? { ...defaultSlot, ...savedSlot } : { ...defaultSlot };
  });

  // Preserve the saved order for pre_history slots (the only reorderable zone).
  // Rebuild: take the saved order of pre_history IDs, then append any missing ones.
  const savedPreHistory = saved.slots.filter(
    (s) => SLOT_META[s.id]?.zone === 'pre_history',
  );
  const savedPreHistoryIds = new Set(savedPreHistory.map((s) => s.id));

  const defaultPreHistory = mergedSlots.filter(
    (s) => SLOT_META[s.id]?.zone === 'pre_history',
  );
  const defaultPreHistoryNotInSaved = defaultPreHistory.filter(
    (s) => !savedPreHistoryIds.has(s.id),
  );

  const orderedPreHistory = [
    ...savedPreHistory.map((s) => {
      const merged = mergedSlots.find((m) => m.id === s.id);
      return merged ?? s;
    }),
    ...defaultPreHistoryNotInSaved,
  ];

  // Reassemble: pre_history (saved order) → history → post_history (default order)
  const history = mergedSlots.filter((s) => SLOT_META[s.id]?.zone === 'history');
  const postHistory = mergedSlots.filter((s) => SLOT_META[s.id]?.zone === 'post_history');

  return { slots: [...orderedPreHistory, ...history, ...postHistory] };
}

/**
 * Apply {{char}} and {{user}} macro substitution to a string.
 */
export function applyMacros(
  text: string,
  charName: string,
  userName: string,
): string {
  return text.replace(/\{\{char\}\}/g, charName).replace(/\{\{user\}\}/g, userName);
}

/**
 * Parse a character's mes_example field (SillyTavern <START> block format)
 * into a single formatted string suitable for injection as a system message.
 *
 * Input format:
 *   <START>
 *   User: message
 *   Char: response
 *   <START>
 *   User: another message
 *   Char: another response
 *
 * Returns null if the field is empty or has no parseable content.
 */
export function parseMesExample(mesExample: string): string | null {
  if (!mesExample.trim()) return null;

  const blocks = mesExample
    .split(/<START>/i)
    .map((b) => b.trim())
    .filter(Boolean);

  if (blocks.length === 0) return null;

  const formatted = blocks.map((block) => block.trim()).join('\n\n---\n\n');
  return `[Example Dialogue]\n\n${formatted}`;
}
