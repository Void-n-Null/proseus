import type { Database } from "bun:sqlite";
import type { ChatNode } from "../../shared/types.ts";
import { getActivePath } from "../../shared/tree.ts";
import { getChatTree } from "../db/messages.ts";
import { getChat } from "../db/chats.ts";
import { getCharacter } from "../db/characters.ts";
import { getPersonaForChat } from "../db/personas.ts";
import { getPromptTemplate } from "../db/settings.ts";
import { applyMacros, parseMesExample } from "../../shared/prompt-template.ts";

export interface PromptMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AssembledPrompt {
  messages: PromptMessage[];
  characterName: string | null;
  modelOverride: string | null;
  /** Trimmed prefill text to append as a partial assistant turn, or null. */
  assistantPrefill: string | null;
}

export function assemblePrompt(
  db: Database,
  chatId: string,
): AssembledPrompt | null {
  const chat = getChat(db, chatId);
  if (!chat?.root_node_id) return null;

  const treeRecord = getChatTree(db, chatId);
  const nodesMap = new Map<string, ChatNode>(Object.entries(treeRecord));
  const pathIds = getActivePath(chat.root_node_id, nodesMap);

  const characterId = getCharacterIdForChat(db, chatId);
  const character = characterId ? getCharacter(db, characterId) : null;
  const persona = getPersonaForChat(db, chatId);
  const template = getPromptTemplate(db);

  const charName = character?.name ?? "Character";
  const userName = persona?.name ?? "User";

  const messages: PromptMessage[] = [];
  let assistantPrefill: string | null = null;

  const enabledSlots = template.slots.filter((s) => s.enabled);

  // Zone 1: Pre-history — all enabled pre_history slots concatenated into one system message
  const preHistoryParts: string[] = [];

  for (const slot of enabledSlots) {
    if (slot.id === "history" || slot.id === "post_history" || slot.id === "assistant_prefill") {
      continue;
    }

    switch (slot.id) {
      case "main": {
        const text = slot.content ?? "";
        if (text.trim()) preHistoryParts.push(applyMacros(text, charName, userName));
        break;
      }
      case "char_system_prompt": {
        if (character?.system_prompt?.trim()) preHistoryParts.push(character.system_prompt);
        break;
      }
      case "char_description": {
        if (character?.description?.trim()) preHistoryParts.push(character.description);
        break;
      }
      case "char_personality": {
        if (character?.personality?.trim()) preHistoryParts.push(`Personality: ${character.personality}`);
        break;
      }
      case "char_scenario": {
        if (character?.scenario?.trim()) preHistoryParts.push(`Scenario: ${character.scenario}`);
        break;
      }
      case "persona": {
        if (persona) {
          const parts = [`[User: ${persona.name}]`];
          if (persona.prompt?.trim()) parts.push(persona.prompt);
          preHistoryParts.push(parts.join("\n"));
        }
        break;
      }
      case "mes_example": {
        if (character?.mes_example) {
          const parsed = parseMesExample(character.mes_example);
          if (parsed) preHistoryParts.push(parsed);
        }
        break;
      }
    }
  }

  if (preHistoryParts.length > 0) {
    messages.push({ role: "system", content: preHistoryParts.join("\n\n") });
  }

  if (enabledSlots.some((s) => s.id === "history")) {
    for (const nodeId of pathIds) {
      const node = nodesMap.get(nodeId);
      if (!node || !node.message.trim()) continue;
      messages.push({
        role: node.is_bot ? "assistant" : "user",
        content: node.message,
      });
    }
  }

  // Zone 3: Post-history (fixed order: post_history then assistant_prefill)
  for (const slot of enabledSlots) {
    if (slot.id === "post_history") {
      if (character?.post_history_instructions?.trim()) {
        messages.push({ role: "system", content: character.post_history_instructions });
      }
    }
    if (slot.id === "assistant_prefill") {
      const trimmed = (slot.content ?? "").trimEnd();
      if (trimmed) assistantPrefill = trimmed;
    }
  }

  return {
    messages,
    characterName: character?.name ?? null,
    modelOverride: null,
    assistantPrefill,
  };
}

function getCharacterIdForChat(db: Database, chatId: string): string | null {
  const row = db
    .query("SELECT character_id FROM chats WHERE id = $id")
    .get({ $id: chatId }) as { character_id: string | null } | null;
  return row?.character_id ?? null;
}
