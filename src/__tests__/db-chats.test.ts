import { test, expect, describe, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { runMigrations } from "../server/db/schema.ts";
import { createSpeaker } from "../server/db/speakers.ts";
import {
  createChat,
  getChat,
  listChats,
  updateChat,
  deleteChat,
  togglePinChat,
  duplicateChat,
} from "../server/db/chats.ts";
import { addMessage } from "../server/db/messages.ts";

describe("chats", () => {
  let db: Database;
  let userId: string;
  let botId: string;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db);

    const user = createSpeaker(db, { name: "User", is_user: true });
    const bot = createSpeaker(db, {
      name: "Bot",
      is_user: false,
      color: "#7c3aed",
    });
    userId = user.id;
    botId = bot.id;
  });

  test("createChat: verify all fields", () => {
    const chat = createChat(db, {
      name: "Test Chat",
      speaker_ids: [userId, botId],
      tags: ["rp", "fantasy"],
    });

    expect(chat.id).toBeTruthy();
    expect(chat.name).toBe("Test Chat");
    expect(chat.root_node_id).toBeNull();
    expect(chat.speaker_ids).toEqual([userId, botId]);
    expect(chat.tags).toEqual(["rp", "fantasy"]);
    expect(chat.created_at).toBeGreaterThan(0);
    expect(chat.updated_at).toBe(chat.created_at);
  });

  test("getChat: includes speaker_ids from junction table", () => {
    const created = createChat(db, {
      name: "Get Test",
      speaker_ids: [userId, botId],
    });

    const chat = getChat(db, created.id);
    expect(chat).not.toBeNull();
    expect(chat!.speaker_ids).toContain(userId);
    expect(chat!.speaker_ids).toContain(botId);
    expect(chat!.speaker_ids).toHaveLength(2);
  });

  test("getChat: returns null for nonexistent id", () => {
    const chat = getChat(db, "nonexistent");
    expect(chat).toBeNull();
  });

  test("listChats: ordered by updated_at DESC", () => {
    const chat1 = createChat(db, {
      name: "First",
      speaker_ids: [userId],
    });

    // Small delay to ensure different timestamps
    const chat2 = createChat(db, {
      name: "Second",
      speaker_ids: [userId],
    });

    // Force a different timestamp by updating chat1
    // Use a raw query to set a definitively later updated_at
    db.query("UPDATE chats SET name = $name, updated_at = $ts WHERE id = $id").run({
      $name: "First Updated",
      $ts: Date.now() + 1000,
      $id: chat1.id,
    });

    const list = listChats(db);
    expect(list).toHaveLength(2);
    expect(list[0]!.name).toBe("First Updated");
    expect(list[1]!.name).toBe("Second");
  });

  test("listChats: includes message_count and last_message_preview", () => {
    const chat = createChat(db, {
      name: "With Messages",
      speaker_ids: [userId, botId],
    });

    const root = addMessage(db, {
      chat_id: chat.id,
      parent_id: null,
      message: "First message",
      speaker_id: botId,
      is_bot: true,
    });

    // Manually bump created_at on the second message so it's reliably "latest"
    const child = addMessage(db, {
      chat_id: chat.id,
      parent_id: root.node.id,
      message: "Latest message",
      speaker_id: userId,
      is_bot: false,
    });

    // Ensure distinct ordering by nudging the child's created_at forward
    db.query("UPDATE chat_nodes SET created_at = created_at + 1000 WHERE id = $id").run({
      $id: child.node.id,
    });

    const list = listChats(db);
    const item = list.find((c) => c.id === chat.id);
    expect(item).toBeDefined();
    expect(item!.message_count).toBe(2);
    expect(item!.last_message_preview).toBe("Latest message");
    expect(item!.character_id).toBeNull();
    expect(item!.character_name).toBeNull();
    expect(item!.character_avatar_url).toBeNull();
    expect(item!.is_pinned).toBe(false);
  });

  test("listChats: supports query filter by chat name", () => {
    createChat(db, {
      name: "Dragon Tavern",
      speaker_ids: [userId],
    });
    createChat(db, {
      name: "Space Station",
      speaker_ids: [userId],
    });

    const list = listChats(db, { q: "dragon" });
    expect(list).toHaveLength(1);
    expect(list[0]!.name).toBe("Dragon Tavern");
  });

  test("listChats: supports pinned_first sort", () => {
    const pinned = createChat(db, {
      name: "Pinned Chat",
      speaker_ids: [userId],
      is_pinned: true,
    });
    createChat(db, {
      name: "Unpinned Chat",
      speaker_ids: [userId],
      is_pinned: false,
    });

    // Ensure pinned chat does not win by updated_at by default
    db.query("UPDATE chats SET updated_at = $ts WHERE id = $id").run({
      $id: pinned.id,
      $ts: Date.now() - 1000,
    });

    const list = listChats(db, { sort: "pinned_first" });
    expect(list).toHaveLength(2);
    expect(list[0]!.name).toBe("Pinned Chat");
    expect(list[0]!.is_pinned).toBe(true);
  });

  test("updateChat: name changes and updated_at bumps", () => {
    const chat = createChat(db, {
      name: "Original",
      speaker_ids: [userId],
    });

    const originalUpdatedAt = chat.updated_at;

    // Ensure time advances
    const updated = updateChat(db, chat.id, { name: "Renamed" });
    expect(updated).not.toBeNull();
    expect(updated!.name).toBe("Renamed");
    expect(updated!.updated_at).toBeGreaterThanOrEqual(originalUpdatedAt);
  });

  test("updateChat: tags round-trip (JSON array)", () => {
    const chat = createChat(db, {
      name: "Tag Test",
      speaker_ids: [userId],
      tags: ["original"],
    });

    const updated = updateChat(db, chat.id, {
      tags: ["updated", "tags", "array"],
    });
    expect(updated!.tags).toEqual(["updated", "tags", "array"]);

    // Verify through getChat as well
    const fetched = getChat(db, chat.id);
    expect(fetched!.tags).toEqual(["updated", "tags", "array"]);
  });

  test("updateChat: returns null for nonexistent chat", () => {
    const result = updateChat(db, "nonexistent", { name: "test" });
    expect(result).toBeNull();
  });

  test("deleteChat: cascades to nodes and chat_speakers", () => {
    const chat = createChat(db, {
      name: "To Delete",
      speaker_ids: [userId, botId],
    });

    addMessage(db, {
      chat_id: chat.id,
      parent_id: null,
      message: "Will be deleted",
      speaker_id: botId,
      is_bot: true,
    });

    const deleted = deleteChat(db, chat.id);
    expect(deleted).toBe(true);

    // Chat should be gone
    expect(getChat(db, chat.id)).toBeNull();

    // Nodes should be cascaded
    const nodes = db
      .query("SELECT * FROM chat_nodes WHERE chat_id = $id")
      .all({ $id: chat.id });
    expect(nodes).toHaveLength(0);

    // chat_speakers should be cascaded
    const speakers = db
      .query("SELECT * FROM chat_speakers WHERE chat_id = $id")
      .all({ $id: chat.id });
    expect(speakers).toHaveLength(0);
  });

  test("deleteChat: returns false for nonexistent chat", () => {
    const result = deleteChat(db, "nonexistent");
    expect(result).toBe(false);
  });

  test("togglePinChat: updates pin state and returns true", () => {
    const chat = createChat(db, {
      name: "Pin Me",
      speaker_ids: [userId],
    });

    const updated = togglePinChat(db, chat.id, true);
    expect(updated).toBe(true);

    const listed = listChats(db).find((c) => c.id === chat.id);
    expect(listed).toBeDefined();
    expect(listed!.is_pinned).toBe(true);
  });

  test("togglePinChat: returns false for nonexistent chat", () => {
    const updated = togglePinChat(db, "missing", true);
    expect(updated).toBe(false);
  });

  test("duplicateChat: creates copied chat with remapped node graph", () => {
    const original = createChat(db, {
      name: "Original Chat",
      speaker_ids: [userId, botId],
      tags: ["story", "test"],
      is_pinned: true,
    });

    // Simulate a character-linked chat (insert minimal character row for FK)
    const now = Date.now();
    db.query(
      `INSERT INTO characters (
        id, name, description, personality, scenario, first_mes, mes_example,
        creator_notes, system_prompt, post_history_instructions, alternate_greetings, tags,
        creator, character_version, avatar, avatar_hash, source_spec, extensions, character_book,
        content_hash, created_at, updated_at
      ) VALUES (
        $id, $name, '', '', '', '', '',
        '', '', '', '[]', '[]',
        '', '', NULL, NULL, 'v2', '{}', NULL,
        $content_hash, $created_at, $updated_at
      )`,
    ).run({
      $id: "character-123",
      $name: "Test Character",
      $content_hash: "character-content-hash-123",
      $created_at: now,
      $updated_at: now,
    });

    db.query("UPDATE chats SET character_id = $character_id WHERE id = $id").run({
      $id: original.id,
      $character_id: "character-123",
    });

    const root = addMessage(db, {
      chat_id: original.id,
      parent_id: null,
      message: "Root node",
      speaker_id: botId,
      is_bot: true,
    });
    const child = addMessage(db, {
      chat_id: original.id,
      parent_id: root.node.id,
      message: "Child node",
      speaker_id: userId,
      is_bot: false,
    });

    // Ensure root has two children to verify child_id remapping integrity
    const sibling = addMessage(db, {
      chat_id: original.id,
      parent_id: root.node.id,
      message: "Sibling node",
      speaker_id: userId,
      is_bot: false,
    });

    const copy = duplicateChat(db, original.id);
    expect(copy).not.toBeNull();
    expect(copy!.id).not.toBe(original.id);
    expect(copy!.name).toBe("Original Chat (copy)");
    expect(copy!.speaker_ids).toHaveLength(2);
    expect(copy!.speaker_ids).toContain(userId);
    expect(copy!.speaker_ids).toContain(botId);
    expect(copy!.tags).toEqual(["story", "test"]);

    const originalTree = db
      .query("SELECT id FROM chat_nodes WHERE chat_id = $chat_id")
      .all({ $chat_id: original.id }) as { id: string }[];
    const copiedTree = db
      .query("SELECT id, parent_id, child_ids FROM chat_nodes WHERE chat_id = $chat_id")
      .all({ $chat_id: copy!.id }) as {
      id: string;
      parent_id: string | null;
      child_ids: string;
    }[];

    expect(copiedTree).toHaveLength(3);
    const originalIds = new Set(originalTree.map((row) => row.id));
    for (const row of copiedTree) {
      expect(originalIds.has(row.id)).toBe(false);
      if (row.parent_id) {
        expect(originalIds.has(row.parent_id)).toBe(false);
      }
      const childIds = JSON.parse(row.child_ids) as string[];
      for (const childId of childIds) {
        expect(originalIds.has(childId)).toBe(false);
      }
    }

    // Sanity check source nodes are untouched and still present
    expect(getChat(db, original.id)).not.toBeNull();
    expect(getChat(db, copy!.id)).not.toBeNull();
    expect(root.node.id).not.toBe(child.node.id);
    expect(sibling.node.id).not.toBe(child.node.id);
  });

  test("duplicateChat: returns null for nonexistent source chat", () => {
    const copy = duplicateChat(db, "missing");
    expect(copy).toBeNull();
  });
});
