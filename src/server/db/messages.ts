import type { Database } from "bun:sqlite";
import type { ChatNode } from "../../shared/types.ts";
import { generateId } from "../../shared/ids.ts";

interface NodeRow {
  id: string;
  client_id: string | null;
  chat_id: string;
  parent_id: string | null;
  child_ids: string;
  active_child_index: number | null;
  speaker_id: string;
  message: string;
  is_bot: number;
  created_at: number;
  updated_at: number | null;
}

function rowToNode(row: NodeRow): ChatNode {
  return {
    id: row.id,
    client_id: row.client_id,
    parent_id: row.parent_id,
    child_ids: JSON.parse(row.child_ids) as string[],
    active_child_index: row.active_child_index,
    speaker_id: row.speaker_id,
    message: row.message,
    is_bot: row.is_bot === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function getNodeRow(db: Database, id: string): NodeRow | null {
  return db
    .query("SELECT * FROM chat_nodes WHERE id = $id")
    .get({ $id: id }) as NodeRow | null;
}

/**
 * ID format: 12-char alphanumeric [0-9A-Za-z].
 * Used to validate client-provided IDs.
 */
const ID_PATTERN = /^[0-9A-Za-z]{12}$/;

export function addMessage(
  db: Database,
  input: {
    chat_id: string;
    parent_id: string | null;
    message: string;
    speaker_id: string;
    is_bot: boolean;
    /** Client-provided ID. Must be 12-char alphanumeric and unique. */
    id?: string | null;
    client_id?: string | null;
  },
): { node: ChatNode; updated_parent: ChatNode | null } {
  let id: string;

  if (input.id) {
    // Validate format
    if (!ID_PATTERN.test(input.id)) {
      throw new Error(`Invalid node ID format: ${input.id}`);
    }
    // Check for collision
    const existing = getNodeRow(db, input.id);
    if (existing) {
      throw new Error(`Node ID already exists: ${input.id}`);
    }
    id = input.id;
  } else {
    id = generateId();
  }

  const now = Date.now();

  let node: ChatNode;
  let updatedParent: ChatNode | null = null;

  db.transaction(() => {
    // Insert the new node
    db.query(
      `INSERT INTO chat_nodes (id, client_id, chat_id, parent_id, child_ids, active_child_index, speaker_id, message, is_bot, created_at, updated_at)
       VALUES ($id, $client_id, $chat_id, $parent_id, '[]', NULL, $speaker_id, $message, $is_bot, $created_at, NULL)`,
    ).run({
      $id: id,
      $client_id: input.client_id ?? null,
      $chat_id: input.chat_id,
      $parent_id: input.parent_id,
      $speaker_id: input.speaker_id,
      $message: input.message,
      $is_bot: input.is_bot ? 1 : 0,
      $created_at: now,
    });

    // Update parent's child_ids and active_child_index
    if (input.parent_id) {
      const parentRow = getNodeRow(db, input.parent_id);
      if (parentRow) {
        const childIds = JSON.parse(parentRow.child_ids) as string[];
        childIds.push(id);
        const newIndex = childIds.length - 1;

        db.query(
          `UPDATE chat_nodes SET child_ids = $child_ids, active_child_index = $active_child_index WHERE id = $id`,
        ).run({
          $id: input.parent_id,
          $child_ids: JSON.stringify(childIds),
          $active_child_index: newIndex,
        });

        updatedParent = rowToNode({
          ...parentRow,
          child_ids: JSON.stringify(childIds),
          active_child_index: newIndex,
        });
      }
    } else {
      // First node in chat — set root_node_id
      db.query(
        `UPDATE chats SET root_node_id = $root_node_id WHERE id = $chat_id`,
      ).run({
        $root_node_id: id,
        $chat_id: input.chat_id,
      });
    }

    node = {
      id,
      client_id: input.client_id ?? null,
      parent_id: input.parent_id,
      child_ids: [],
      active_child_index: null,
      speaker_id: input.speaker_id,
      message: input.message,
      is_bot: input.is_bot,
      created_at: now,
      updated_at: null,
    };
  })();

  return { node: node!, updated_parent: updatedParent };
}

export function editMessage(
  db: Database,
  nodeId: string,
  message: string,
): ChatNode | null {
  const now = Date.now();

  const result = db
    .query(
      `UPDATE chat_nodes SET message = $message, updated_at = $updated_at WHERE id = $id`,
    )
    .run({
      $id: nodeId,
      $message: message,
      $updated_at: now,
    });

  if (result.changes === 0) return null;

  const row = getNodeRow(db, nodeId);
  return row ? rowToNode(row) : null;
}

export function deleteMessage(db: Database, nodeId: string): boolean {
  let deleted = false;

  db.transaction(() => {
    const row = getNodeRow(db, nodeId);
    if (!row) return;

    // Collect all descendant IDs recursively
    const toDelete: string[] = [nodeId];
    const queue: string[] = [nodeId];

    while (queue.length > 0) {
      const current = queue.pop()!;
      const children = db
        .query("SELECT id FROM chat_nodes WHERE parent_id = $id")
        .all({ $id: current }) as { id: string }[];
      for (const child of children) {
        toDelete.push(child.id);
        queue.push(child.id);
      }
    }

    // Delete all nodes in subtree (children first to respect FK, or use
    // a single batch since we're deleting the whole subtree)
    // We need to nullify parent_id references first to avoid FK issues
    for (const delId of toDelete.reverse()) {
      db.query("UPDATE chat_nodes SET parent_id = NULL WHERE id = $id").run({
        $id: delId,
      });
    }
    for (const delId of toDelete) {
      db.query("DELETE FROM chat_nodes WHERE id = $id").run({ $id: delId });
    }

    // Update parent's child_ids
    if (row.parent_id) {
      const parentRow = getNodeRow(db, row.parent_id);
      if (parentRow) {
        const childIds = (JSON.parse(parentRow.child_ids) as string[]).filter(
          (cid) => cid !== nodeId,
        );
        let activeIndex = parentRow.active_child_index;

        if (childIds.length === 0) {
          activeIndex = null;
        } else if (activeIndex !== null && activeIndex >= childIds.length) {
          activeIndex = childIds.length - 1;
        }

        db.query(
          `UPDATE chat_nodes SET child_ids = $child_ids, active_child_index = $active_child_index WHERE id = $id`,
        ).run({
          $id: row.parent_id,
          $child_ids: JSON.stringify(childIds),
          $active_child_index: activeIndex,
        });
      }
    } else {
      // Deleted the root node — clear root_node_id on chat
      db.query(
        `UPDATE chats SET root_node_id = NULL WHERE root_node_id = $root_node_id`,
      ).run({ $root_node_id: nodeId });
    }

    deleted = true;
  })();

  return deleted;
}

export function getChatTree(
  db: Database,
  chatId: string,
): Record<string, ChatNode> {
  const rows = db
    .query("SELECT * FROM chat_nodes WHERE chat_id = $chatId")
    .all({ $chatId: chatId }) as NodeRow[];

  const tree: Record<string, ChatNode> = {};
  for (const row of rows) {
    tree[row.id] = rowToNode(row);
  }
  return tree;
}

export function switchBranch(
  db: Database,
  chatId: string,
  targetNodeId: string,
): ChatNode[] {
  const updated: ChatNode[] = [];

  db.transaction(() => {
    // Load the target node to verify it belongs to this chat
    const targetRow = getNodeRow(db, targetNodeId);
    if (!targetRow || targetRow.chat_id !== chatId) return;

    // Walk up from target, updating each ancestor's active_child_index
    let currentId: string = targetNodeId;
    let parentId: string | null = targetRow.parent_id;

    while (parentId) {
      const parentRow = getNodeRow(db, parentId);
      if (!parentRow) break;

      const childIds = JSON.parse(parentRow.child_ids) as string[];
      const newIndex = childIds.indexOf(currentId);

      if (newIndex !== -1 && newIndex !== parentRow.active_child_index) {
        db.query(
          `UPDATE chat_nodes SET active_child_index = $active_child_index WHERE id = $id`,
        ).run({
          $id: parentId,
          $active_child_index: newIndex,
        });

        updated.push(
          rowToNode({
            ...parentRow,
            active_child_index: newIndex,
          }),
        );
      }

      currentId = parentId;
      parentId = parentRow.parent_id;
    }
  })();

  return updated;
}

export function swipeSibling(
  db: Database,
  nodeId: string,
  direction: "prev" | "next",
): { updated_parent: ChatNode; active_sibling: ChatNode } | null {
  const row = getNodeRow(db, nodeId);
  if (!row || !row.parent_id) return null;

  const parentRow = getNodeRow(db, row.parent_id);
  if (!parentRow) return null;

  const childIds = JSON.parse(parentRow.child_ids) as string[];
  if (childIds.length <= 1) return null;

  const currentIndex = parentRow.active_child_index ?? 0;
  let newIndex: number;

  if (direction === "next") {
    newIndex = Math.min(currentIndex + 1, childIds.length - 1);
  } else {
    newIndex = Math.max(currentIndex - 1, 0);
  }

  if (newIndex === currentIndex) return null;

  db.query(
    `UPDATE chat_nodes SET active_child_index = $active_child_index WHERE id = $id`,
  ).run({
    $id: row.parent_id,
    $active_child_index: newIndex,
  });

  const activeSiblingId = childIds[newIndex]!;
  const siblingRow = getNodeRow(db, activeSiblingId);
  if (!siblingRow) return null;

  return {
    updated_parent: rowToNode({
      ...parentRow,
      active_child_index: newIndex,
    }),
    active_sibling: rowToNode(siblingRow),
  };
}
