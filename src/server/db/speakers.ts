import type { Database } from "bun:sqlite";
import type { Speaker } from "../../shared/types.ts";
import { generateId } from "../../shared/ids.ts";

interface SpeakerRow {
  id: string;
  name: string;
  avatar_blob: Uint8Array | null;
  avatar_mime: string | null;
  color: string | null;
  is_user: number;
  created_at: number;
}

function rowToSpeaker(row: SpeakerRow): Speaker {
  return {
    id: row.id,
    name: row.name,
    avatar_url: row.avatar_blob ? `/api/speakers/${row.id}/avatar` : null,
    color: row.color,
    is_user: row.is_user === 1,
    created_at: row.created_at,
  };
}

export function createSpeaker(
  db: Database,
  input: { name: string; is_user: boolean; color?: string | null },
): Speaker {
  const id = generateId();
  const now = Date.now();

  db.query(
    `INSERT INTO speakers (id, name, color, is_user, created_at)
     VALUES ($id, $name, $color, $is_user, $created_at)`,
  ).run({
    $id: id,
    $name: input.name,
    $color: input.color ?? null,
    $is_user: input.is_user ? 1 : 0,
    $created_at: now,
  });

  return {
    id,
    name: input.name,
    avatar_url: null,
    color: input.color ?? null,
    is_user: input.is_user,
    created_at: now,
  };
}

export function getSpeaker(db: Database, id: string): Speaker | null {
  const row = db
    .query("SELECT * FROM speakers WHERE id = $id")
    .get({ $id: id }) as SpeakerRow | null;
  return row ? rowToSpeaker(row) : null;
}

export function listSpeakers(db: Database): Speaker[] {
  const rows = db.query("SELECT * FROM speakers").all() as SpeakerRow[];
  return rows.map(rowToSpeaker);
}

export function updateSpeaker(
  db: Database,
  id: string,
  input: { name?: string; color?: string | null },
): Speaker | null {
  const existing = db
    .query("SELECT * FROM speakers WHERE id = $id")
    .get({ $id: id }) as SpeakerRow | null;

  if (!existing) return null;

  const name = input.name ?? existing.name;
  const color = input.color !== undefined ? input.color : existing.color;

  db.query(
    `UPDATE speakers SET name = $name, color = $color WHERE id = $id`,
  ).run({
    $id: id,
    $name: name,
    $color: color,
  });

  return rowToSpeaker({ ...existing, name, color });
}

export function deleteSpeaker(db: Database, id: string): boolean {
  const result = db
    .query("DELETE FROM speakers WHERE id = $id")
    .run({ $id: id });
  return result.changes > 0;
}
