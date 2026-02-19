import type { Database } from "bun:sqlite";
import type { Persona } from "../../shared/types.ts";
import { generateId } from "../../shared/ids.ts";

interface PersonaRow {
  id: string;
  name: string;
  prompt: string;
  avatar_blob: Uint8Array | null;
  avatar_mime: string | null;
  is_global: number;
  created_at: number;
  updated_at: number;
}

function rowToPersona(row: PersonaRow): Persona {
  return {
    id: row.id,
    name: row.name,
    prompt: row.prompt,
    avatar_url: row.avatar_blob ? `/api/personas/${row.id}/avatar` : null,
    is_global: row.is_global === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function listPersonas(db: Database): Persona[] {
  const rows = db
    .query(
      `SELECT id, name, prompt, avatar_blob, avatar_mime, is_global, created_at, updated_at
       FROM personas ORDER BY created_at ASC`,
    )
    .all() as PersonaRow[];
  return rows.map(rowToPersona);
}

export function getPersona(db: Database, id: string): Persona | null {
  const row = db
    .query(
      `SELECT id, name, prompt, avatar_blob, avatar_mime, is_global, created_at, updated_at
       FROM personas WHERE id = $id`,
    )
    .get({ $id: id }) as PersonaRow | null;
  return row ? rowToPersona(row) : null;
}

export function getPersonaAvatar(
  db: Database,
  id: string,
): { avatar: Uint8Array; mime: string } | null {
  const row = db
    .query("SELECT avatar_blob, avatar_mime FROM personas WHERE id = $id")
    .get({ $id: id }) as { avatar_blob: Uint8Array | null; avatar_mime: string | null } | null;
  if (!row?.avatar_blob || !row.avatar_mime) return null;
  return { avatar: row.avatar_blob, mime: row.avatar_mime };
}

export function createPersona(
  db: Database,
  input: { name: string; prompt?: string; is_global?: boolean },
): Persona {
  const id = generateId();
  const now = Date.now();
  const prompt = input.prompt ?? "";
  const is_global = input.is_global ? 1 : 0;

  db.query(
    `INSERT INTO personas (id, name, prompt, is_global, created_at, updated_at)
     VALUES ($id, $name, $prompt, $is_global, $created_at, $updated_at)`,
  ).run({
    $id: id,
    $name: input.name,
    $prompt: prompt,
    $is_global: is_global,
    $created_at: now,
    $updated_at: now,
  });

  return {
    id,
    name: input.name,
    prompt,
    avatar_url: null,
    is_global: input.is_global ?? false,
    created_at: now,
    updated_at: now,
  };
}

export function updatePersona(
  db: Database,
  id: string,
  input: { name?: string; prompt?: string; is_global?: boolean },
): Persona | null {
  const existing = db
    .query(
      `SELECT id, name, prompt, avatar_blob, avatar_mime, is_global, created_at, updated_at
       FROM personas WHERE id = $id`,
    )
    .get({ $id: id }) as PersonaRow | null;

  if (!existing) return null;

  const name = input.name ?? existing.name;
  const prompt = input.prompt !== undefined ? input.prompt : existing.prompt;
  const is_global =
    input.is_global !== undefined ? (input.is_global ? 1 : 0) : existing.is_global;
  const now = Date.now();

  db.query(
    `UPDATE personas SET name = $name, prompt = $prompt, is_global = $is_global, updated_at = $updated_at
     WHERE id = $id`,
  ).run({
    $id: id,
    $name: name,
    $prompt: prompt,
    $is_global: is_global,
    $updated_at: now,
  });

  return rowToPersona({ ...existing, name, prompt, is_global, updated_at: now });
}

export function setPersonaAvatar(
  db: Database,
  id: string,
  avatar: Uint8Array,
  mime: string,
): boolean {
  const result = db
    .query(
      `UPDATE personas SET avatar_blob = $blob, avatar_mime = $mime, updated_at = $now WHERE id = $id`,
    )
    .run({ $id: id, $blob: avatar, $mime: mime, $now: Date.now() });
  return result.changes > 0;
}

export function deletePersona(db: Database, id: string): boolean {
  const result = db
    .query("DELETE FROM personas WHERE id = $id")
    .run({ $id: id });
  return result.changes > 0;
}

/** Return the first global persona, or null if none is set. */
export function getGlobalPersona(db: Database): Persona | null {
  const row = db
    .query(
      `SELECT id, name, prompt, avatar_blob, avatar_mime, is_global, created_at, updated_at
       FROM personas WHERE is_global = 1 ORDER BY created_at ASC LIMIT 1`,
    )
    .get() as PersonaRow | null;
  return row ? rowToPersona(row) : null;
}

/** Return the persona linked to a chat, if any. */
export function getPersonaForChat(db: Database, chatId: string): Persona | null {
  const row = db
    .query("SELECT persona_id FROM chats WHERE id = $id")
    .get({ $id: chatId }) as { persona_id: string | null } | null;
  if (!row?.persona_id) return null;
  return getPersona(db, row.persona_id);
}
