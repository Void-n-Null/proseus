import type { Database } from "bun:sqlite";

/** Run all schema migrations. Enables WAL mode and foreign keys. */
export function runMigrations(db: Database): void {
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");

  db.exec(`
    CREATE TABLE IF NOT EXISTS speakers (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      avatar_blob BLOB,
      avatar_mime TEXT,
      color       TEXT,
      is_user     INTEGER NOT NULL DEFAULT 0,
      created_at  INTEGER NOT NULL
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS chats (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      root_node_id TEXT,
      tags         TEXT NOT NULL DEFAULT '[]',
      created_at   INTEGER NOT NULL,
      updated_at   INTEGER NOT NULL
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_chats_updated_at ON chats(updated_at DESC);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_speakers (
      chat_id    TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      speaker_id TEXT NOT NULL REFERENCES speakers(id) ON DELETE CASCADE,
      PRIMARY KEY (chat_id, speaker_id)
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_nodes (
      id                 TEXT PRIMARY KEY,
      client_id          TEXT,
      chat_id            TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      parent_id          TEXT REFERENCES chat_nodes(id) ON DELETE SET NULL,
      child_ids          TEXT NOT NULL DEFAULT '[]',
      active_child_index INTEGER,
      speaker_id         TEXT NOT NULL REFERENCES speakers(id),
      message            TEXT NOT NULL DEFAULT '',
      is_bot             INTEGER NOT NULL DEFAULT 0,
      created_at         INTEGER NOT NULL,
      updated_at         INTEGER
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_chat_nodes_chat ON chat_nodes(chat_id);
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_chat_nodes_parent ON chat_nodes(parent_id);
  `);

  // ── Characters table (Phase 3) ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS characters (
      id                       TEXT PRIMARY KEY,
      name                     TEXT NOT NULL,
      description              TEXT NOT NULL DEFAULT '',
      personality              TEXT NOT NULL DEFAULT '',
      scenario                 TEXT NOT NULL DEFAULT '',
      first_mes                TEXT NOT NULL DEFAULT '',
      mes_example              TEXT NOT NULL DEFAULT '',

      creator_notes            TEXT NOT NULL DEFAULT '',
      system_prompt            TEXT NOT NULL DEFAULT '',
      post_history_instructions TEXT NOT NULL DEFAULT '',
      alternate_greetings      TEXT NOT NULL DEFAULT '[]',
      tags                     TEXT NOT NULL DEFAULT '[]',
      creator                  TEXT NOT NULL DEFAULT '',
      character_version        TEXT NOT NULL DEFAULT '',

      avatar                   BLOB,
      avatar_hash              TEXT,
      source_spec              TEXT NOT NULL DEFAULT 'v2',
      extensions               TEXT NOT NULL DEFAULT '{}',
      character_book           TEXT,
      content_hash             TEXT NOT NULL,

      created_at               INTEGER NOT NULL,
      updated_at               INTEGER NOT NULL
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_characters_name ON characters(name);
  `);

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_characters_content_hash ON characters(content_hash);
  `);

  // ── Connections table (API key storage) ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS connections (
      provider    TEXT PRIMARY KEY,
      api_key     TEXT NOT NULL,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );
  `);

  // ── Settings table (key-value store for user preferences) ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // ── Personas table (Phase 7) ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS personas (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      prompt      TEXT NOT NULL DEFAULT '',
      avatar_blob BLOB,
      avatar_mime TEXT,
      is_global   INTEGER NOT NULL DEFAULT 0,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_personas_is_global ON personas(is_global);
  `);

  // ── Migrations for existing tables ──
  // These ALTER TABLEs add columns introduced in Phase 3+.
  // Each is wrapped in try/catch because ALTER TABLE ADD COLUMN
  // throws if the column already exists. This is a stopgap until
  // a proper numbered migration system is built (tracked tech debt).
  const alterColumns = [
    `ALTER TABLE chats ADD COLUMN character_id TEXT REFERENCES characters(id) ON DELETE SET NULL`,
    `ALTER TABLE speakers ADD COLUMN character_id TEXT REFERENCES characters(id) ON DELETE SET NULL`,
    `ALTER TABLE chats ADD COLUMN persona_id TEXT REFERENCES personas(id) ON DELETE SET NULL`,
  ];
  for (const sql of alterColumns) {
    try {
      db.exec(sql);
    } catch {
      // Column already exists — expected on subsequent runs
    }
  }
}
