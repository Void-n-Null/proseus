import type { Database } from "bun:sqlite";
import type { Chat, ChatListItem } from "../../shared/types.ts";
import { generateId } from "../../shared/ids.ts";
import { getChatTree } from "./messages.ts";

interface ChatRow {
  id: string;
  name: string;
  root_node_id: string | null;
  tags: string;
  character_id: string | null;
  persona_id: string | null;
  is_pinned: number;
  created_at: number;
  updated_at: number;
}

export interface ChatListOptions {
  sort?: "updated_at" | "created_at" | "message_count" | "name" | "pinned_first";
  q?: string;
}

function getSpeakerIds(db: Database, chatId: string): string[] {
  const rows = db
    .query("SELECT speaker_id FROM chat_speakers WHERE chat_id = $chatId")
    .all({ $chatId: chatId }) as { speaker_id: string }[];
  return rows.map((r) => r.speaker_id);
}

function rowToChat(db: Database, row: ChatRow): Chat {
  return {
    id: row.id,
    name: row.name,
    root_node_id: row.root_node_id,
    speaker_ids: getSpeakerIds(db, row.id),
    tags: JSON.parse(row.tags) as string[],
    persona_id: row.persona_id ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function createChat(
  db: Database,
  input: {
    name: string;
    speaker_ids: string[];
    tags?: string[];
    root_node_id?: string | null;
    character_id?: string | null;
    persona_id?: string | null;
    is_pinned?: boolean;
  },
): Chat {
  const id = generateId();
  const now = Date.now();
  const tags = input.tags ?? [];

  db.transaction(() => {
    db.query(
      `INSERT INTO chats (id, name, root_node_id, tags, character_id, persona_id, is_pinned, created_at, updated_at)
       VALUES ($id, $name, $root_node_id, $tags, $character_id, $persona_id, $is_pinned, $created_at, $updated_at)`,
    ).run({
      $id: id,
      $name: input.name,
      $root_node_id: input.root_node_id ?? null,
      $tags: JSON.stringify(tags),
      $character_id: input.character_id ?? null,
      $persona_id: input.persona_id ?? null,
      $is_pinned: input.is_pinned ? 1 : 0,
      $created_at: now,
      $updated_at: now,
    });

    const insertSpeaker = db.query(
      `INSERT INTO chat_speakers (chat_id, speaker_id) VALUES ($chat_id, $speaker_id)`,
    );
    for (const speakerId of input.speaker_ids) {
      insertSpeaker.run({ $chat_id: id, $speaker_id: speakerId });
    }
  })();

  return {
    id,
    name: input.name,
    root_node_id: input.root_node_id ?? null,
    speaker_ids: input.speaker_ids,
    tags,
    persona_id: null,
    created_at: now,
    updated_at: now,
  };
}

export function getChat(db: Database, id: string): Chat | null {
  const row = db
    .query("SELECT * FROM chats WHERE id = $id")
    .get({ $id: id }) as ChatRow | null;
  return row ? rowToChat(db, row) : null;
}

const ORDER_BY_SQL: Record<NonNullable<ChatListOptions["sort"]>, string> = {
  updated_at: "c.updated_at DESC",
  created_at: "c.created_at DESC",
  message_count: "message_count DESC, c.updated_at DESC",
  name: "c.name COLLATE NOCASE ASC, c.updated_at DESC",
  pinned_first: "c.is_pinned DESC, c.updated_at DESC",
};

export function listChats(db: Database, opts?: ChatListOptions): ChatListItem[] {
  const q = opts?.q?.trim();
  const orderBy = ORDER_BY_SQL[opts?.sort ?? "updated_at"];
  const hasQuery = Boolean(q);

  const query = db.query(
    `SELECT
         c.id, c.name, c.tags, c.character_id, c.persona_id, c.is_pinned, c.created_at, c.updated_at,
         ch.name AS character_name,
         COUNT(cn.id) AS message_count,
         (SELECT cn2.message FROM chat_nodes cn2
          WHERE cn2.chat_id = c.id
          ORDER BY cn2.created_at DESC LIMIT 1) AS last_message_preview
       FROM chats c
       LEFT JOIN characters ch ON c.character_id = ch.id
       LEFT JOIN chat_nodes cn ON cn.chat_id = c.id
       ${hasQuery ? "WHERE (c.name LIKE $q OR ch.name LIKE $q)" : ""}
       GROUP BY c.id
       ORDER BY ${orderBy}`,
  );
  const rows = (
    hasQuery ? query.all({ $q: `%${q}%` }) : query.all()
  ) as (ChatRow & {
    character_name: string | null;
    message_count: number;
    last_message_preview: string | null;
  })[];

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    speaker_ids: getSpeakerIds(db, row.id),
    character_id: row.character_id ?? null,
    character_name: row.character_name ?? null,
    character_avatar_url: row.character_id
      ? `/api/characters/${row.character_id}/avatar`
      : null,
    is_pinned: row.is_pinned === 1,
    tags: JSON.parse(row.tags) as string[],
    message_count: row.message_count,
    last_message_preview: row.last_message_preview ?? "",
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
}

export function updateChat(
  db: Database,
  id: string,
  input: { name?: string; tags?: string[]; persona_id?: string | null },
): Chat | null {
  const existing = db
    .query("SELECT * FROM chats WHERE id = $id")
    .get({ $id: id }) as ChatRow | null;

  if (!existing) return null;

  const name = input.name ?? existing.name;
  const tags =
    input.tags !== undefined ? input.tags : (JSON.parse(existing.tags) as string[]);
  // persona_id: explicit null clears it, undefined keeps existing
  const persona_id =
    "persona_id" in input ? (input.persona_id ?? null) : (existing.persona_id ?? null);
  const now = Date.now();

  db.query(
    `UPDATE chats SET name = $name, tags = $tags, persona_id = $persona_id, updated_at = $updated_at WHERE id = $id`,
  ).run({
    $id: id,
    $name: name,
    $tags: JSON.stringify(tags),
    $persona_id: persona_id,
    $updated_at: now,
  });

  return {
    id,
    name,
    root_node_id: existing.root_node_id,
    speaker_ids: getSpeakerIds(db, id),
    tags,
    persona_id,
    created_at: existing.created_at,
    updated_at: now,
  };
}

export function deleteChat(db: Database, id: string): boolean {
  const result = db
    .query("DELETE FROM chats WHERE id = $id")
    .run({ $id: id });
  return result.changes > 0;
}

export function togglePinChat(db: Database, id: string, isPinned: boolean): boolean {
  const result = db
    .query(
      "UPDATE chats SET is_pinned = $is_pinned, updated_at = $updated_at WHERE id = $id",
    )
    .run({
      $id: id,
      $is_pinned: isPinned ? 1 : 0,
      $updated_at: Date.now(),
    });
  return result.changes > 0;
}

export function duplicateChat(db: Database, sourceId: string): Chat | null {
  const source = db
    .query("SELECT * FROM chats WHERE id = $id")
    .get({ $id: sourceId }) as ChatRow | null;
  if (!source) return null;

  const sourceSpeakerIds = getSpeakerIds(db, sourceId);
  const sourceTags = JSON.parse(source.tags) as string[];
  const sourceTree = getChatTree(db, sourceId);
  const sourceNodeIds = Object.keys(sourceTree);

  const newChatId = generateId();
  const now = Date.now();

  db.transaction(() => {
    db.query(
      `INSERT INTO chats (id, name, root_node_id, tags, character_id, persona_id, is_pinned, created_at, updated_at)
       VALUES ($id, $name, $root_node_id, $tags, $character_id, $persona_id, $is_pinned, $created_at, $updated_at)`,
    ).run({
      $id: newChatId,
      $name: `${source.name} (copy)`,
      $root_node_id: null,
      $tags: JSON.stringify(sourceTags),
      $character_id: source.character_id,
      $persona_id: source.persona_id,
      $is_pinned: source.is_pinned,
      $created_at: now,
      $updated_at: now,
    });

    const insertSpeaker = db.query(
      "INSERT INTO chat_speakers (chat_id, speaker_id) VALUES ($chat_id, $speaker_id)",
    );
    for (const speakerId of sourceSpeakerIds) {
      insertSpeaker.run({ $chat_id: newChatId, $speaker_id: speakerId });
    }

    const idMap = new Map<string, string>();
    for (const nodeId of sourceNodeIds) {
      idMap.set(nodeId, generateId());
    }

    const insertNode = db.query(
      `INSERT INTO chat_nodes (
        id, client_id, chat_id, parent_id, child_ids, active_child_index,
        speaker_id, message, is_bot, created_at, updated_at
      ) VALUES (
        $id, $client_id, $chat_id, $parent_id, $child_ids, $active_child_index,
        $speaker_id, $message, $is_bot, $created_at, $updated_at
      )`,
    );

    for (const sourceNodeId of sourceNodeIds) {
      const sourceNode = sourceTree[sourceNodeId]!;
      const remappedId = idMap.get(sourceNodeId)!;
      const remappedParentId = sourceNode.parent_id
        ? (idMap.get(sourceNode.parent_id) ?? null)
        : null;
      const remappedChildIds = sourceNode.child_ids
        .map((childId) => idMap.get(childId))
        .filter((childId): childId is string => childId !== undefined);

      insertNode.run({
        $id: remappedId,
        $client_id: sourceNode.client_id,
        $chat_id: newChatId,
        $parent_id: remappedParentId,
        $child_ids: JSON.stringify(remappedChildIds),
        $active_child_index: sourceNode.active_child_index,
        $speaker_id: sourceNode.speaker_id,
        $message: sourceNode.message,
        $is_bot: sourceNode.is_bot ? 1 : 0,
        $created_at: sourceNode.created_at,
        $updated_at: sourceNode.updated_at,
      });
    }

    const remappedRootNodeId = source.root_node_id
      ? (idMap.get(source.root_node_id) ?? null)
      : null;
    db.query("UPDATE chats SET root_node_id = $root_node_id WHERE id = $id").run({
      $id: newChatId,
      $root_node_id: remappedRootNodeId,
    });
  })();

  return getChat(db, newChatId);
}
