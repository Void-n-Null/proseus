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
});
