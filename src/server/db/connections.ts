/**
 * Connections DB — CRUD for provider API keys.
 *
 * Stores one API key per provider in the connections table.
 * Keys are encrypted at rest with AES-256-GCM. The encryption key lives
 * in a separate file (.proseus-key) so leaking the SQLite DB alone does
 * not expose API keys.
 */

import type { Database } from "bun:sqlite";
import type { ProviderName } from "../../shared/providers.ts";
import { encrypt, decrypt, isEncrypted, isLegacyEncrypted } from "../lib/crypto.ts";

export interface ConnectionRow {
  provider: ProviderName;
  api_key: string;
  created_at: number;
  updated_at: number;
}

/** Status of a single provider connection (no key exposed). */
export interface ConnectionStatus {
  provider: ProviderName;
  connected: boolean;
  updated_at: number | null;
}

/** Get all connections (status only — never leak raw keys to the client). */
export function listConnections(db: Database): ConnectionStatus[] {
  const rows = db
    .query("SELECT provider, updated_at FROM connections ORDER BY updated_at DESC")
    .all() as Pick<ConnectionRow, "provider" | "updated_at">[];

  return rows.map((r) => ({
    provider: r.provider,
    connected: true,
    updated_at: r.updated_at,
  }));
}

/** Get a single connection's API key (server-side only). Decrypts from storage. */
export async function getApiKey(
  db: Database,
  provider: ProviderName,
): Promise<string | null> {
  const row = db
    .query("SELECT api_key FROM connections WHERE provider = $provider")
    .get({ $provider: provider }) as { api_key: string } | null;

  if (!row) return null;

  // Decrypt if encrypted (v1: prefix or legacy format), return as-is if plaintext
  if (isEncrypted(row.api_key) || isLegacyEncrypted(row.api_key)) {
    return decrypt(row.api_key);
  }
  return row.api_key;
}

/** Upsert a connection (insert or update the key). Encrypts before storage. */
export async function upsertConnection(
  db: Database,
  provider: ProviderName,
  apiKey: string,
): Promise<ConnectionRow> {
  const now = Date.now();
  const encryptedKey = await encrypt(apiKey);

  db.query(
    `INSERT INTO connections (provider, api_key, created_at, updated_at)
     VALUES ($provider, $apiKey, $now, $now)
     ON CONFLICT(provider) DO UPDATE SET
       api_key = excluded.api_key,
       updated_at = excluded.updated_at`,
  ).run({ $provider: provider, $apiKey: encryptedKey, $now: now });

  // Read back the actual row so created_at is correct on conflict updates
  // (ON CONFLICT preserves the original created_at, but we'd return `now` if
  // we constructed the return value from local variables).
  return db
    .query(
      "SELECT provider, api_key, created_at, updated_at FROM connections WHERE provider = $provider",
    )
    .get({ $provider: provider }) as ConnectionRow;
}

/** Delete a connection. */
export function deleteConnection(
  db: Database,
  provider: ProviderName,
): boolean {
  const result = db
    .query("DELETE FROM connections WHERE provider = $provider")
    .run({ $provider: provider });
  return result.changes > 0;
}

/** Check if a provider has a stored API key. */
export function hasConnection(
  db: Database,
  provider: ProviderName,
): boolean {
  const row = db
    .query("SELECT 1 FROM connections WHERE provider = $provider")
    .get({ $provider: provider });
  return row !== null;
}

/**
 * Migrate connections to the current encrypted format (v1: prefix).
 * Handles three cases:
 *   1. Already v1: prefixed → skip
 *   2. Legacy encrypted (raw base64, no prefix) → decrypt, re-encrypt with prefix
 *   3. Plaintext → encrypt with prefix
 *
 * Safe to call on every startup — idempotent once all values are v1: format.
 */
export async function migrateUnencryptedKeys(db: Database): Promise<number> {
  const rows = db
    .query("SELECT provider, api_key FROM connections")
    .all() as Pick<ConnectionRow, "provider" | "api_key">[];

  let migrated = 0;

  for (const row of rows) {
    // Already in current format — nothing to do
    if (isEncrypted(row.api_key)) continue;

    // Determine the plaintext value: either decrypt legacy or use as-is
    let plaintext: string;
    if (isLegacyEncrypted(row.api_key)) {
      plaintext = await decrypt(row.api_key);
    } else {
      plaintext = row.api_key;
    }

    const encryptedKey = await encrypt(plaintext);
    db.query(
      "UPDATE connections SET api_key = $apiKey WHERE provider = $provider",
    ).run({ $apiKey: encryptedKey, $provider: row.provider });
    migrated++;
  }

  if (migrated > 0) {
    console.log(`[crypto] Migrated ${migrated} key(s) to v1: encrypted format`);
  }

  return migrated;
}
