import { test, expect, describe, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { runMigrations } from "../server/db/schema.ts";
import { createSpeaker } from "../server/db/speakers.ts";
import { createChat } from "../server/db/chats.ts";
import {
  addMessage,
  editMessage,
  deleteMessage,
  getChatTree,
  switchBranch,
  swipeSibling,
} from "../server/db/messages.ts";

describe("messages", () => {
  let db: Database;
  let userId: string;
  let botId: string;
  let chatId: string;

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

    const chat = createChat(db, {
      name: "Test Chat",
      speaker_ids: [userId, botId],
    });
    chatId = chat.id;
  });

  // --- addMessage ---

  test("addMessage: insert root node sets chat root_node_id", () => {
    const { node, updated_parent } = addMessage(db, {
      chat_id: chatId,
      parent_id: null,
      message: "Hello",
      speaker_id: botId,
      is_bot: true,
    });

    expect(node.id).toBeTruthy();
    expect(node.parent_id).toBeNull();
    expect(node.message).toBe("Hello");
    expect(node.is_bot).toBe(true);
    expect(node.child_ids).toEqual([]);
    expect(node.active_child_index).toBeNull();
    expect(updated_parent).toBeNull();

    // Verify chat's root_node_id was set
    const chatRow = db
      .query("SELECT root_node_id FROM chats WHERE id = $id")
      .get({ $id: chatId }) as { root_node_id: string | null };
    expect(chatRow.root_node_id).toBe(node.id);
  });

  test("addMessage: insert child updates parent child_ids", () => {
    const root = addMessage(db, {
      chat_id: chatId,
      parent_id: null,
      message: "Root",
      speaker_id: botId,
      is_bot: true,
    });

    const { node, updated_parent } = addMessage(db, {
      chat_id: chatId,
      parent_id: root.node.id,
      message: "Child",
      speaker_id: userId,
      is_bot: false,
    });

    expect(node.parent_id).toBe(root.node.id);
    expect(updated_parent).not.toBeNull();
    expect(updated_parent!.child_ids).toContain(node.id);
    expect(updated_parent!.active_child_index).toBe(0);
  });

  test("addMessage: second child creates branch, active_child_index points to new child", () => {
    const root = addMessage(db, {
      chat_id: chatId,
      parent_id: null,
      message: "Root",
      speaker_id: botId,
      is_bot: true,
    });

    const child1 = addMessage(db, {
      chat_id: chatId,
      parent_id: root.node.id,
      message: "Child 1",
      speaker_id: userId,
      is_bot: false,
    });

    const child2 = addMessage(db, {
      chat_id: chatId,
      parent_id: root.node.id,
      message: "Child 2",
      speaker_id: userId,
      is_bot: false,
    });

    expect(child2.updated_parent!.child_ids).toHaveLength(2);
    expect(child2.updated_parent!.child_ids).toContain(child1.node.id);
    expect(child2.updated_parent!.child_ids).toContain(child2.node.id);
    expect(child2.updated_parent!.active_child_index).toBe(1);
  });

  test("addMessage: preserves client_id", () => {
    const { node } = addMessage(db, {
      chat_id: chatId,
      parent_id: null,
      message: "Test",
      speaker_id: userId,
      is_bot: false,
      client_id: "client-abc-123",
    });

    expect(node.client_id).toBe("client-abc-123");
  });

  // --- editMessage ---

  test("editMessage: updates content and sets updated_at", () => {
    const { node } = addMessage(db, {
      chat_id: chatId,
      parent_id: null,
      message: "Original",
      speaker_id: userId,
      is_bot: false,
    });

    expect(node.updated_at).toBeNull();

    const edited = editMessage(db, node.id, "Edited");
    expect(edited).not.toBeNull();
    expect(edited!.message).toBe("Edited");
    expect(edited!.updated_at).not.toBeNull();
    expect(edited!.updated_at).toBeGreaterThan(0);
  });

  test("editMessage: returns null for nonexistent node", () => {
    const result = editMessage(db, "nonexistent", "test");
    expect(result).toBeNull();
  });

  // --- deleteMessage ---

  test("deleteMessage: delete leaf, parent child_ids shrinks", () => {
    const root = addMessage(db, {
      chat_id: chatId,
      parent_id: null,
      message: "Root",
      speaker_id: botId,
      is_bot: true,
    });

    const child = addMessage(db, {
      chat_id: chatId,
      parent_id: root.node.id,
      message: "Child",
      speaker_id: userId,
      is_bot: false,
    });

    const deleted = deleteMessage(db, child.node.id);
    expect(deleted).toBe(true);

    const tree = getChatTree(db, chatId);
    const parentNode = tree[root.node.id];
    expect(parentNode).toBeDefined();
    expect(parentNode!.child_ids).toHaveLength(0);
    expect(parentNode!.active_child_index).toBeNull();
  });

  test("deleteMessage: delete node with children removes entire subtree", () => {
    const root = addMessage(db, {
      chat_id: chatId,
      parent_id: null,
      message: "Root",
      speaker_id: botId,
      is_bot: true,
    });

    const child = addMessage(db, {
      chat_id: chatId,
      parent_id: root.node.id,
      message: "Child",
      speaker_id: userId,
      is_bot: false,
    });

    const grandchild = addMessage(db, {
      chat_id: chatId,
      parent_id: child.node.id,
      message: "Grandchild",
      speaker_id: botId,
      is_bot: true,
    });

    deleteMessage(db, child.node.id);

    const tree = getChatTree(db, chatId);
    expect(tree[child.node.id]).toBeUndefined();
    expect(tree[grandchild.node.id]).toBeUndefined();
    expect(tree[root.node.id]).toBeDefined();
    expect(tree[root.node.id]!.child_ids).toHaveLength(0);
  });

  test("deleteMessage: returns false for nonexistent node", () => {
    const result = deleteMessage(db, "nonexistent");
    expect(result).toBe(false);
  });

  test("deleteMessage: adjusts parent active_child_index when deleting active child", () => {
    const root = addMessage(db, {
      chat_id: chatId,
      parent_id: null,
      message: "Root",
      speaker_id: botId,
      is_bot: true,
    });

    const child1 = addMessage(db, {
      chat_id: chatId,
      parent_id: root.node.id,
      message: "Child 1",
      speaker_id: userId,
      is_bot: false,
    });

    const child2 = addMessage(db, {
      chat_id: chatId,
      parent_id: root.node.id,
      message: "Child 2",
      speaker_id: userId,
      is_bot: false,
    });

    // active_child_index should be 1 (pointing to child2)
    // Delete child2; active_child_index should clamp to 0
    deleteMessage(db, child2.node.id);

    const tree = getChatTree(db, chatId);
    const rootNode = tree[root.node.id];
    expect(rootNode!.child_ids).toHaveLength(1);
    expect(rootNode!.child_ids[0]).toBe(child1.node.id);
    expect(rootNode!.active_child_index).toBe(0);
  });

  // --- getChatTree ---

  test("getChatTree: loads all nodes as flat map", () => {
    const root = addMessage(db, {
      chat_id: chatId,
      parent_id: null,
      message: "Root",
      speaker_id: botId,
      is_bot: true,
    });

    const child1 = addMessage(db, {
      chat_id: chatId,
      parent_id: root.node.id,
      message: "Child 1",
      speaker_id: userId,
      is_bot: false,
    });

    const child2 = addMessage(db, {
      chat_id: chatId,
      parent_id: root.node.id,
      message: "Child 2",
      speaker_id: userId,
      is_bot: false,
    });

    const tree = getChatTree(db, chatId);
    expect(Object.keys(tree)).toHaveLength(3);
    expect(tree[root.node.id]).toBeDefined();
    expect(tree[child1.node.id]).toBeDefined();
    expect(tree[child2.node.id]).toBeDefined();

    // Verify parsed child_ids
    expect(tree[root.node.id]!.child_ids).toEqual([
      child1.node.id,
      child2.node.id,
    ]);
    expect(tree[root.node.id]!.is_bot).toBe(true);
    expect(tree[child1.node.id]!.is_bot).toBe(false);
  });

  // --- switchBranch ---

  test("switchBranch: switches to a different sibling, ancestors updated", () => {
    const root = addMessage(db, {
      chat_id: chatId,
      parent_id: null,
      message: "Root",
      speaker_id: botId,
      is_bot: true,
    });

    const child1 = addMessage(db, {
      chat_id: chatId,
      parent_id: root.node.id,
      message: "Child 1",
      speaker_id: userId,
      is_bot: false,
    });

    addMessage(db, {
      chat_id: chatId,
      parent_id: root.node.id,
      message: "Child 2",
      speaker_id: userId,
      is_bot: false,
    });

    // active_child_index should be 1 (child2). Switch to child1.
    const updated = switchBranch(db, chatId, child1.node.id);
    expect(updated).toHaveLength(1);
    expect(updated[0]!.id).toBe(root.node.id);
    expect(updated[0]!.active_child_index).toBe(0);

    // Verify in DB
    const tree = getChatTree(db, chatId);
    expect(tree[root.node.id]!.active_child_index).toBe(0);
  });

  test("switchBranch: switching to already-active branch returns empty", () => {
    const root = addMessage(db, {
      chat_id: chatId,
      parent_id: null,
      message: "Root",
      speaker_id: botId,
      is_bot: true,
    });

    const child = addMessage(db, {
      chat_id: chatId,
      parent_id: root.node.id,
      message: "Child",
      speaker_id: userId,
      is_bot: false,
    });

    // child is the only child, already active
    const updated = switchBranch(db, chatId, child.node.id);
    expect(updated).toHaveLength(0);
  });

  test("switchBranch: deep branch updates multiple ancestors", () => {
    const root = addMessage(db, {
      chat_id: chatId,
      parent_id: null,
      message: "Root",
      speaker_id: botId,
      is_bot: true,
    });

    const branchA = addMessage(db, {
      chat_id: chatId,
      parent_id: root.node.id,
      message: "Branch A",
      speaker_id: userId,
      is_bot: false,
    });

    const branchB = addMessage(db, {
      chat_id: chatId,
      parent_id: root.node.id,
      message: "Branch B",
      speaker_id: userId,
      is_bot: false,
    });

    const deepA = addMessage(db, {
      chat_id: chatId,
      parent_id: branchA.node.id,
      message: "Deep A",
      speaker_id: botId,
      is_bot: true,
    });

    // Currently active: root -> branchB (index 1)
    // Switch to deepA, which requires root -> branchA (index 0)
    const updated = switchBranch(db, chatId, deepA.node.id);

    // Should have updated root's active_child_index to 0
    expect(updated.length).toBeGreaterThanOrEqual(1);
    const rootUpdate = updated.find((n) => n.id === root.node.id);
    expect(rootUpdate).toBeDefined();
    expect(rootUpdate!.active_child_index).toBe(0);
  });

  // --- swipeSibling ---

  test("swipeSibling: next on first child moves to second", () => {
    const root = addMessage(db, {
      chat_id: chatId,
      parent_id: null,
      message: "Root",
      speaker_id: botId,
      is_bot: true,
    });

    const child1 = addMessage(db, {
      chat_id: chatId,
      parent_id: root.node.id,
      message: "Child 1",
      speaker_id: userId,
      is_bot: false,
    });

    const child2 = addMessage(db, {
      chat_id: chatId,
      parent_id: root.node.id,
      message: "Child 2",
      speaker_id: userId,
      is_bot: false,
    });

    // Switch to child1 first
    switchBranch(db, chatId, child1.node.id);

    const result = swipeSibling(db, child1.node.id, "next");
    expect(result).not.toBeNull();
    expect(result!.updated_parent.active_child_index).toBe(1);
    expect(result!.active_sibling.id).toBe(child2.node.id);
  });

  test("swipeSibling: prev on first child returns null (clamped)", () => {
    const root = addMessage(db, {
      chat_id: chatId,
      parent_id: null,
      message: "Root",
      speaker_id: botId,
      is_bot: true,
    });

    const child1 = addMessage(db, {
      chat_id: chatId,
      parent_id: root.node.id,
      message: "Child 1",
      speaker_id: userId,
      is_bot: false,
    });

    addMessage(db, {
      chat_id: chatId,
      parent_id: root.node.id,
      message: "Child 2",
      speaker_id: userId,
      is_bot: false,
    });

    // Switch to child1 first (index 0)
    switchBranch(db, chatId, child1.node.id);

    const result = swipeSibling(db, child1.node.id, "prev");
    expect(result).toBeNull();
  });

  test("swipeSibling: next on last child returns null (clamped)", () => {
    const root = addMessage(db, {
      chat_id: chatId,
      parent_id: null,
      message: "Root",
      speaker_id: botId,
      is_bot: true,
    });

    addMessage(db, {
      chat_id: chatId,
      parent_id: root.node.id,
      message: "Child 1",
      speaker_id: userId,
      is_bot: false,
    });

    const child2 = addMessage(db, {
      chat_id: chatId,
      parent_id: root.node.id,
      message: "Child 2",
      speaker_id: userId,
      is_bot: false,
    });

    // active is already child2 (index 1, last)
    const result = swipeSibling(db, child2.node.id, "next");
    expect(result).toBeNull();
  });

  test("swipeSibling: returns null for root node (no parent)", () => {
    const root = addMessage(db, {
      chat_id: chatId,
      parent_id: null,
      message: "Root",
      speaker_id: botId,
      is_bot: true,
    });

    const result = swipeSibling(db, root.node.id, "next");
    expect(result).toBeNull();
  });
});
