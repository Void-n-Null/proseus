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
}
