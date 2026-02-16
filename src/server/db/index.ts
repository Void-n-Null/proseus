import { Database } from "bun:sqlite";
import { runMigrations } from "./schema.ts";

/** Create a database instance with migrations applied. */
export function createDatabase(path?: string): Database {
  const db = new Database(path ?? "proseus.db", { create: true });
  runMigrations(db);
  return db;
}

/** Default singleton for production use. */
const db = createDatabase();

export default db;
