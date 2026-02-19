/**
 * Chat Pipeline — Server-side prompt assembly.
 *
 * Builds the full messages array for an OpenRouter API call from:
 *   1. Character card fields (system prompt, description, personality, scenario)
 *   2. Chat history (active path through the message tree)
 *   3. Post-history instructions (the "jailbreak"/"UJB" slot)
 *
 * Follows the SillyTavern-style prompt template:
 *   [system] system_prompt + character card
 *   [user/assistant...] chat history
 *   [system] post_history_instructions (if present)
 *
 * This module is intentionally a pure function — it reads from the DB
 * and returns a messages array. No streaming, no API calls. The
 * StreamManager calls this, then feeds the result to streamText().
 *
 * Future expansion points (marked with comments):
 *   - Lorebook injection (scan history for keywords, inject entries)
 *   - Token counting / context window management
 *   - Per-character model overrides
 *   - Persona/user character card
 *   - Example messages (mes_example) injection
 */

import type { Database } from "bun:sqlite";
import type { ChatNode } from "../../shared/types.ts";
import { getActivePath } from "../../shared/tree.ts";
import { getChatTree } from "../db/messages.ts";
import { getChat } from "../db/chats.ts";
import { getCharacter } from "../db/characters.ts";
import { getPersonaForChat } from "../db/personas.ts";

/** A single message in the prompt, ready for the AI SDK. */
export interface PromptMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Full assembled prompt + metadata for the StreamManager. */
export interface AssembledPrompt {
  messages: PromptMessage[];
  /** The character's name, used for logging/display. */
  characterName: string | null;
  /** The model to use, if the character specifies one (future). */
  modelOverride: string | null;
}

/**
 * Assemble a complete prompt for an AI generation request.
 *
 * @param db - Database instance
 * @param chatId - The chat to build the prompt for
 * @returns The assembled messages array, or null if the chat doesn't exist
 */
export function assemblePrompt(
  db: Database,
  chatId: string,
): AssembledPrompt | null {
  const chat = getChat(db, chatId);
  if (!chat?.root_node_id) return null;

  // Load the full message tree and compute the active path
  const treeRecord = getChatTree(db, chatId);
  const nodesMap = new Map<string, ChatNode>(Object.entries(treeRecord));
  const pathIds = getActivePath(chat.root_node_id, nodesMap);

  // Try to load the character and persona associated with this chat
  const characterId = getCharacterIdForChat(db, chatId);
  const character = characterId ? getCharacter(db, characterId) : null;
  const persona = getPersonaForChat(db, chatId);

  const messages: PromptMessage[] = [];

  // ── 1. System prompt (character card) ──
  const systemParts: string[] = [];

  if (character) {
    // Character's explicit system prompt takes priority
    if (character.system_prompt) {
      systemParts.push(character.system_prompt);
    }

    // Assemble the character card block
    const cardParts: string[] = [];

    if (character.description) {
      cardParts.push(character.description);
    }
    if (character.personality) {
      cardParts.push(`Personality: ${character.personality}`);
    }
    if (character.scenario) {
      cardParts.push(`Scenario: ${character.scenario}`);
    }

    if (cardParts.length > 0) {
      systemParts.push(cardParts.join("\n"));
    }

    // TODO: Example messages (mes_example) could be injected here
    // as few-shot examples. SillyTavern parses the <START> format
    // and converts to user/assistant pairs. For now, we skip this.

    // TODO: Lorebook entries would be injected here based on keyword
    // scanning of the chat history. character.character_book contains
    // the entries but activation logic is not implemented yet.
  }

  // ── Persona context (injected into the system prompt) ──
  if (persona) {
    const personaParts: string[] = [`[User: ${persona.name}]`];
    if (persona.prompt) {
      personaParts.push(persona.prompt);
    }
    systemParts.push(personaParts.join("\n"));
  }

  if (systemParts.length > 0) {
    messages.push({
      role: "system",
      content: systemParts.join("\n\n"),
    });
  }

  // ── 2. Chat history ──
  for (const nodeId of pathIds) {
    const node = nodesMap.get(nodeId);
    if (!node) continue;

    // Skip empty messages (shouldn't happen, but defensive)
    if (!node.message.trim()) continue;

    messages.push({
      role: node.is_bot ? "assistant" : "user",
      content: node.message,
    });
  }

  // ── 3. Post-history instructions (jailbreak/UJB slot) ──
  if (character?.post_history_instructions) {
    messages.push({
      role: "system",
      content: character.post_history_instructions,
    });
  }

  return {
    messages,
    characterName: character?.name ?? null,
    modelOverride: null, // TODO: per-character model override
  };
}

/**
 * Get the character_id for a chat from the chats table.
 * Returns null if the chat has no associated character.
 */
function getCharacterIdForChat(
  db: Database,
  chatId: string,
): string | null {
  const row = db
    .query("SELECT character_id FROM chats WHERE id = $id")
    .get({ $id: chatId }) as { character_id: string | null } | null;
  return row?.character_id ?? null;
}
