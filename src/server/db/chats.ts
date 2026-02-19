import type { Database } from "bun:sqlite";
import type { Chat, ChatListItem } from "../../shared/types.ts";
import { generateId } from "../../shared/ids.ts";

interface ChatRow {
  id: string;
  name: string;
  root_node_id: string | null;
  tags: string;
  persona_id: string | null;
  created_at: number;
  updated_at: number;
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
  },
): Chat {
  const id = generateId();
  const now = Date.now();
  const tags = input.tags ?? [];

  db.transaction(() => {
    db.query(
      `INSERT INTO chats (id, name, root_node_id, tags, created_at, updated_at)
       VALUES ($id, $name, $root_node_id, $tags, $created_at, $updated_at)`,
    ).run({
      $id: id,
      $name: input.name,
      $root_node_id: input.root_node_id ?? null,
      $tags: JSON.stringify(tags),
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

export function listChats(db: Database): ChatListItem[] {
  const rows = db
    .query(
      `SELECT
         c.id, c.name, c.tags, c.created_at, c.updated_at,
         COUNT(cn.id) AS message_count,
         (SELECT cn2.message FROM chat_nodes cn2
          WHERE cn2.chat_id = c.id
          ORDER BY cn2.created_at DESC LIMIT 1) AS last_message_preview
       FROM chats c
       LEFT JOIN chat_nodes cn ON cn.chat_id = c.id
       GROUP BY c.id
       ORDER BY c.updated_at DESC`,
    )
    .all() as (ChatRow & {
    message_count: number;
    last_message_preview: string | null;
  })[];

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    speaker_ids: getSpeakerIds(db, row.id),
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
