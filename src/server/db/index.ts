import { Database } from "bun:sqlite";
import { runMigrations } from "./schema.ts";
import { ensureEncryptionKey } from "../lib/crypto.ts";
import {
  ensureParentDirectoryExists,
  getDatabasePath,
} from "../lib/data-paths.ts";
import { migrateUnencryptedKeys } from "./connections.ts";

/** Create a database instance with migrations applied. */
export function createDatabase(path?: string): Database {
  const resolvedPath = getDatabasePath(path);
  if (resolvedPath !== ":memory:") {
    ensureParentDirectoryExists(resolvedPath);
  }
  const db = new Database(resolvedPath, { create: true });
  runMigrations(db);
  return db;
}

/**
 * Initialize the database and encryption subsystem.
 * Must be awaited before handling any requests.
 *
 * 1. Ensures the encryption key file exists (generates if missing)
 * 2. Migrates any existing plaintext API keys to encrypted form
 */
export async function initDatabase(db: Database): Promise<void> {
  await ensureEncryptionKey();
  await migrateUnencryptedKeys(db);
}

/** Default singleton for production use. */
const db = createDatabase();

export default db;
