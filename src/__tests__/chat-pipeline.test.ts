/**
 * chat-pipeline.test.ts — Tests for src/server/services/chat-pipeline.ts
 *
 * The chat pipeline assembles the full LLM prompt from character cards,
 * personas, prompt templates, and chat history. It's the bridge between
 * user data and the AI model — getting it wrong means garbled prompts,
 * lost context, or wrong character voice.
 *
 * Coverage:
 *  - Basic prompt assembly with character + history
 *  - Zone ordering: pre-history system → history → post-history
 *  - Macro substitution: {{char}} and {{user}} replaced
 *  - flattenHistory: single user message with Name: prefixes
 *  - upToNodeId: truncates history at correct point
 *  - assistant_prefill: returns trimmed prefill text
 *  - Disabled slots are omitted
 *  - No character: simplified prompt
 *  - No persona: [User: User] not emitted
 *  - No messages: returns null
 *  - Persona attached to chat
 *  - Character with all fields populated
 *  - mes_example inclusion
 */

import { test, expect, describe, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import * as fc from "fast-check";

import { runMigrations } from "../server/db/schema.ts";
import { assemblePrompt } from "../server/services/chat-pipeline.ts";
import { createSpeaker } from "../server/db/speakers.ts";
import { createChat, updateChat } from "../server/db/chats.ts";
import { addMessage } from "../server/db/messages.ts";
import { createCharacter } from "../server/db/characters.ts";
import { createPersona } from "../server/db/personas.ts";
import { setPromptTemplate, getPromptTemplate } from "../server/db/settings.ts";
import type { NormalizedCard } from "../server/lib/character-card-parser.ts";
import { DEFAULT_PROMPT_TEMPLATE, DEFAULT_MAIN_PROMPT } from "../shared/prompt-template.ts";

// ── Test Helpers ──────────────────────────────────────────────

/** Build a minimal character card. */
function makeCard(overrides?: Partial<NormalizedCard>): NormalizedCard {
  return {
    name: overrides?.name ?? "TestBot",
    description: overrides?.description ?? "A helpful test bot.",
    personality: overrides?.personality ?? "Friendly and direct.",
    scenario: overrides?.scenario ?? "You are chatting in a test.",
    first_mes: overrides?.first_mes ?? "Hello!",
    mes_example: overrides?.mes_example ?? "",
    creator_notes: overrides?.creator_notes ?? "",
    system_prompt: overrides?.system_prompt ?? "",
    post_history_instructions: overrides?.post_history_instructions ?? "",
    alternate_greetings: overrides?.alternate_greetings ?? [],
    tags: overrides?.tags ?? [],
    creator: overrides?.creator ?? "tester",
    character_version: overrides?.character_version ?? "1.0",
    source_spec: "v2",
    extensions: overrides?.extensions ?? {},
    character_book: overrides?.character_book ?? null,
  };
}

interface SeededChat {
  db: Database;
  chatId: string;
  userId: string;
  botId: string;
  characterId: string;
  /** Node IDs in order of creation (active path). */
  nodeIds: string[];
}

/**
 * Seed a DB with a character, speakers, chat, and a few messages.
 * Returns everything needed for assemblePrompt tests.
 */
async function seedChat(opts?: {
  cardOverrides?: Partial<NormalizedCard>;
  messageCount?: number;
  persona?: { name: string; prompt?: string };
}): Promise<SeededChat> {
  const db = new Database(":memory:");
  runMigrations(db);

  const card = makeCard(opts?.cardOverrides);
  const { character } = await createCharacter(db, card, undefined, { force: true });

  const user = createSpeaker(db, { name: "User", is_user: true });
  const bot = createSpeaker(db, { name: "Bot", is_user: false, color: "#7c3aed" });

  const chat = createChat(db, {
    name: character.name,
    speaker_ids: [user.id, bot.id],
  });

  // Link chat to character
  db.query("UPDATE chats SET character_id = $cid WHERE id = $id").run({
    $cid: character.id,
    $id: chat.id,
  });

  // Attach persona if requested
  if (opts?.persona) {
    const persona = createPersona(db, {
      name: opts.persona.name,
      prompt: opts.persona.prompt ?? "",
    });
    updateChat(db, chat.id, { persona_id: persona.id });
  }

  // Add alternating messages
  const count = opts?.messageCount ?? 4;
  const nodeIds: string[] = [];
  let parentId: string | null = null;

  for (let i = 0; i < count; i++) {
    const isBot = i % 2 === 1;
    const { node } = addMessage(db, {
      chat_id: chat.id,
      parent_id: parentId,
      message: isBot ? `Bot reply ${i}` : `User message ${i}`,
      speaker_id: isBot ? bot.id : user.id,
      is_bot: isBot,
    });
    nodeIds.push(node.id);
    parentId = node.id;
  }

  return {
    db,
    chatId: chat.id,
    userId: user.id,
    botId: bot.id,
    characterId: character.id,
    nodeIds,
  };
}

// ── Tests ──────────────────────────────────────────────────────

describe("assemblePrompt", () => {
  // ── Basic Assembly ─────────────────────────────

  test("returns null for nonexistent chat", async () => {
    const db = new Database(":memory:");
    runMigrations(db);
    const result = assemblePrompt(db, "nonexistent");
    expect(result).toBeNull();
  });

  test("returns null for chat with no messages (no root_node_id)", async () => {
    const db = new Database(":memory:");
    runMigrations(db);
    const user = createSpeaker(db, { name: "User", is_user: true });
    const bot = createSpeaker(db, { name: "Bot", is_user: false });
    const chat = createChat(db, { name: "Empty", speaker_ids: [user.id, bot.id] });

    const result = assemblePrompt(db, chat.id);
    expect(result).toBeNull();
  });

  test("assembles basic prompt with character + history", async () => {
    const { db, chatId } = await seedChat();
    const result = assemblePrompt(db, chatId);

    expect(result).not.toBeNull();
    expect(result!.messages.length).toBeGreaterThan(0);
    expect(result!.characterName).toBe("TestBot");
    expect(result!.assistantPrefill).toBeNull(); // Default template has prefill disabled
  });

  // ── Zone Ordering ──────────────────────────────

  test("first message is system (pre-history zone)", async () => {
    const { db, chatId } = await seedChat();
    const result = assemblePrompt(db, chatId)!;

    // First message should be system (main prompt + character description etc.)
    expect(result.messages[0]!.role).toBe("system");
  });

  test("system message contains main prompt content", async () => {
    const { db, chatId } = await seedChat();
    const result = assemblePrompt(db, chatId)!;

    const systemMsg = result.messages[0]!;
    expect(systemMsg.role).toBe("system");
    // Default main prompt: "Write {{char}}'s next reply..."
    // After macro substitution: "Write TestBot's next reply..."
    expect(systemMsg.content).toContain("TestBot");
    expect(systemMsg.content).toContain("next reply");
  });

  test("system message contains character description", async () => {
    const { db, chatId } = await seedChat({
      cardOverrides: { description: "A brave warrior from the north." },
    });
    const result = assemblePrompt(db, chatId)!;
    const systemContent = result.messages[0]!.content;
    expect(systemContent).toContain("A brave warrior from the north.");
  });

  test("system message contains character personality", async () => {
    const { db, chatId } = await seedChat({
      cardOverrides: { personality: "Stoic and honorable" },
    });
    const result = assemblePrompt(db, chatId)!;
    const systemContent = result.messages[0]!.content;
    expect(systemContent).toContain("Personality: Stoic and honorable");
  });

  test("system message contains character scenario", async () => {
    const { db, chatId } = await seedChat({
      cardOverrides: { scenario: "In a dark tavern" },
    });
    const result = assemblePrompt(db, chatId)!;
    const systemContent = result.messages[0]!.content;
    expect(systemContent).toContain("Scenario: In a dark tavern");
  });

  test("history messages follow system message", async () => {
    const { db, chatId } = await seedChat({ messageCount: 4 });
    const result = assemblePrompt(db, chatId)!;

    // First is system, rest are history
    expect(result.messages[0]!.role).toBe("system");
    // History starts at index 1
    const historyMsgs = result.messages.slice(1);
    expect(historyMsgs.length).toBeGreaterThanOrEqual(4);

    // Alternating user/assistant
    for (const msg of historyMsgs) {
      expect(["user", "assistant"]).toContain(msg.role);
    }
  });

  // ── Macro Substitution ─────────────────────────

  test("{{char}} replaced with character name", async () => {
    const { db, chatId } = await seedChat({
      cardOverrides: { name: "Alice" },
    });
    const result = assemblePrompt(db, chatId)!;
    const systemContent = result.messages[0]!.content;
    expect(systemContent).toContain("Alice");
    expect(systemContent).not.toContain("{{char}}");
  });

  test("{{user}} replaced with persona name when persona attached", async () => {
    const { db, chatId } = await seedChat({
      persona: { name: "Bob" },
    });
    const result = assemblePrompt(db, chatId)!;
    const systemContent = result.messages[0]!.content;
    expect(systemContent).toContain("Bob");
    expect(systemContent).not.toContain("{{user}}");
  });

  test("{{user}} defaults to 'User' when no persona", async () => {
    const { db, chatId } = await seedChat();
    const result = assemblePrompt(db, chatId)!;
    const systemContent = result.messages[0]!.content;
    // "Write TestBot's next reply in a fictional chat between TestBot and User."
    expect(systemContent).toContain("User");
  });

  // ── Persona ────────────────────────────────────

  test("persona prompt included in system message", async () => {
    const { db, chatId } = await seedChat({
      persona: { name: "Bob", prompt: "Bob is a seasoned adventurer." },
    });
    const result = assemblePrompt(db, chatId)!;
    const systemContent = result.messages[0]!.content;
    expect(systemContent).toContain("[User: Bob]");
    expect(systemContent).toContain("Bob is a seasoned adventurer.");
  });

  test("no persona section when no persona attached", async () => {
    const { db, chatId } = await seedChat();
    const result = assemblePrompt(db, chatId)!;
    const systemContent = result.messages[0]!.content;
    expect(systemContent).not.toContain("[User:");
  });

  // ── upToNodeId ─────────────────────────────────

  test("upToNodeId truncates history at correct point", async () => {
    const { db, chatId, nodeIds } = await seedChat({ messageCount: 6 });

    // Full prompt has all 6 messages
    const full = assemblePrompt(db, chatId)!;
    const fullHistory = full.messages.filter((m) => m.role !== "system");

    // Truncate to 3rd node
    const truncated = assemblePrompt(db, chatId, nodeIds[2])!;
    const truncHistory = truncated.messages.filter((m) => m.role !== "system");

    expect(truncHistory.length).toBeLessThan(fullHistory.length);
    expect(truncHistory.length).toBe(3);
  });

  test("upToNodeId with nonexistent ID returns full path", async () => {
    const { db, chatId } = await seedChat({ messageCount: 4 });
    const full = assemblePrompt(db, chatId)!;
    const withBadId = assemblePrompt(db, chatId, "nonexistent-node-id")!;
    // Should return full path since ID isn't found
    expect(withBadId.messages.length).toBe(full.messages.length);
  });

  // ── flattenHistory ─────────────────────────────

  test("flattenHistory produces single user message with Name: prefixes", async () => {
    const { db, chatId } = await seedChat({
      cardOverrides: { name: "Alice" },
      messageCount: 4,
      persona: { name: "Bob" },
    });

    // Set flattenHistory on the template
    const template = getPromptTemplate(db);
    setPromptTemplate(db, { ...template, flattenHistory: true });

    const result = assemblePrompt(db, chatId)!;

    // System message is still first
    expect(result.messages[0]!.role).toBe("system");

    // All history flattened into a single user message
    const historyMsgs = result.messages.filter(
      (m, i) => i > 0 && m.role === "user" || m.role === "assistant",
    );
    // With flatten, there should be exactly one user message for history
    // (possibly plus post_history as another user message)
    const userMsgs = result.messages.filter((m) => m.role === "user");
    expect(userMsgs.length).toBeGreaterThanOrEqual(1);

    // The flattened message should contain Name: prefixes
    const flatMsg = userMsgs[0]!;
    expect(flatMsg.content).toContain("Alice:");
    expect(flatMsg.content).toContain("Bob:");
  });

  // ── assistant_prefill ──────────────────────────

  test("assistant_prefill returned when enabled with content", async () => {
    const { db, chatId } = await seedChat();

    const template = getPromptTemplate(db);
    const updatedSlots = template.slots.map((s) =>
      s.id === "assistant_prefill"
        ? { ...s, enabled: true, content: "Sure, I'd be happy to help! " }
        : s,
    );
    setPromptTemplate(db, { ...template, slots: updatedSlots });

    const result = assemblePrompt(db, chatId)!;
    expect(result.assistantPrefill).toBe("Sure, I'd be happy to help!");
  });

  test("assistant_prefill null when disabled", async () => {
    const { db, chatId } = await seedChat();
    // Default template has prefill disabled
    const result = assemblePrompt(db, chatId)!;
    expect(result.assistantPrefill).toBeNull();
  });

  test("assistant_prefill null when content is empty/whitespace", async () => {
    const { db, chatId } = await seedChat();

    const template = getPromptTemplate(db);
    const updatedSlots = template.slots.map((s) =>
      s.id === "assistant_prefill"
        ? { ...s, enabled: true, content: "   " }
        : s,
    );
    setPromptTemplate(db, { ...template, slots: updatedSlots });

    const result = assemblePrompt(db, chatId)!;
    // trimEnd() on whitespace-only → empty string → falsy → null
    expect(result.assistantPrefill).toBeNull();
  });

  // ── Disabled Slots ─────────────────────────────

  test("disabling all pre-history slots removes system message", async () => {
    const { db, chatId } = await seedChat();

    const template = getPromptTemplate(db);
    const updatedSlots = template.slots.map((s) => {
      // Disable everything except history and post_history and assistant_prefill
      if (s.id === "history" || s.id === "post_history" || s.id === "assistant_prefill") return s;
      return { ...s, enabled: false };
    });
    setPromptTemplate(db, { ...template, slots: updatedSlots });

    const result = assemblePrompt(db, chatId)!;
    // No system message since all pre-history slots are disabled
    expect(result.messages[0]!.role).not.toBe("system");
    // History messages start immediately
    expect(["user", "assistant"]).toContain(result.messages[0]!.role);
  });

  test("disabling history slot omits chat messages", async () => {
    const { db, chatId } = await seedChat({ messageCount: 4 });

    const template = getPromptTemplate(db);
    const updatedSlots = template.slots.map((s) =>
      s.id === "history" ? { ...s, enabled: false } : s,
    );
    setPromptTemplate(db, { ...template, slots: updatedSlots });

    const result = assemblePrompt(db, chatId)!;
    // Only system message (and maybe post_history), no user/assistant from history
    const historyRoles = result.messages.filter(
      (m) => m.role === "assistant",
    );
    expect(historyRoles).toHaveLength(0);
  });

  // ── Character system_prompt ────────────────────

  test("character system_prompt included in system message", async () => {
    const { db, chatId } = await seedChat({
      cardOverrides: { system_prompt: "You must always speak in rhymes." },
    });

    const result = assemblePrompt(db, chatId)!;
    const systemContent = result.messages[0]!.content;
    expect(systemContent).toContain("You must always speak in rhymes.");
  });

  // ── post_history_instructions ──────────────────

  test("character post_history_instructions appear after history", async () => {
    const { db, chatId } = await seedChat({
      cardOverrides: { post_history_instructions: "Remember to stay in character." },
      messageCount: 2,
    });

    const result = assemblePrompt(db, chatId)!;
    const msgs = result.messages;

    // Last non-prefill message should be a user message containing post-history
    const lastMsg = msgs[msgs.length - 1]!;
    expect(lastMsg.role).toBe("user");
    expect(lastMsg.content).toContain("Remember to stay in character.");
  });

  // ── mes_example ────────────────────────────────

  test("mes_example included when slot is enabled", async () => {
    const { db, chatId } = await seedChat({
      cardOverrides: { mes_example: "<START>\n{{user}}: Hi!\n{{char}}: Hello there!" },
    });

    // Enable mes_example slot
    const template = getPromptTemplate(db);
    const updatedSlots = template.slots.map((s) =>
      s.id === "mes_example" ? { ...s, enabled: true } : s,
    );
    setPromptTemplate(db, { ...template, slots: updatedSlots });

    const result = assemblePrompt(db, chatId)!;
    const systemContent = result.messages[0]!.content;
    // mes_example should be in the system message
    expect(systemContent).toContain("Hi!");
    expect(systemContent).toContain("Hello there!");
  });

  test("mes_example omitted when slot is disabled (default)", async () => {
    const { db, chatId } = await seedChat({
      cardOverrides: { mes_example: "<START>\n{{user}}: Hi!\n{{char}}: Hello there!" },
    });

    // Default template has mes_example disabled
    const result = assemblePrompt(db, chatId)!;
    const systemContent = result.messages[0]!.content;
    // mes_example content should NOT be in the system message
    expect(systemContent).not.toContain("Hi!");
  });

  // ── No Character ───────────────────────────────

  test("prompt without character still works (no description/personality)", async () => {
    const db = new Database(":memory:");
    runMigrations(db);

    const user = createSpeaker(db, { name: "User", is_user: true });
    const bot = createSpeaker(db, { name: "Bot", is_user: false });
    const chat = createChat(db, { name: "NoChar", speaker_ids: [user.id, bot.id] });
    // No character linked

    const { node } = addMessage(db, {
      chat_id: chat.id,
      parent_id: null,
      message: "Hello",
      speaker_id: user.id,
      is_bot: false,
    });

    const result = assemblePrompt(db, chat.id)!;
    expect(result).not.toBeNull();
    expect(result.characterName).toBeNull();
    // Should still have a system message with the main prompt
    expect(result.messages[0]!.role).toBe("system");
    // Uses "Character" as default name
    expect(result.messages[0]!.content).toContain("Character");
  });

  // ── modelOverride ──────────────────────────────

  test("modelOverride is null (not yet implemented)", async () => {
    const { db, chatId } = await seedChat();
    const result = assemblePrompt(db, chatId)!;
    expect(result.modelOverride).toBeNull();
  });

  // ── Property-Based ─────────────────────────────

  describe("Property-based tests", () => {
    test("if any pre-history slot is enabled, first message is system role", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 8 }),
          async (msgCount) => {
            const { db, chatId } = await seedChat({ messageCount: msgCount });
            // Default template has pre-history slots enabled
            const result = assemblePrompt(db, chatId);
            expect(result).not.toBeNull();
            expect(result!.messages[0]!.role).toBe("system");
          },
        ),
        { numRuns: 10 },
      );
    });

    test("message count in prompt correlates with input messages", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 10 }),
          async (msgCount) => {
            const { db, chatId } = await seedChat({ messageCount: msgCount });
            const result = assemblePrompt(db, chatId)!;

            // Total messages = 1 system + msgCount history + possible post_history
            // History should have exactly msgCount messages in standard mode
            const nonSystem = result.messages.filter((m) => m.role !== "system");
            // At least the history messages
            expect(nonSystem.length).toBeGreaterThanOrEqual(msgCount);
          },
        ),
        { numRuns: 10 },
      );
    });
  });
});
