/**
 * db-connections.test.ts — Tests for src/server/db/connections.ts
 *
 * The connections module manages encrypted API key storage. This is the most
 * security-critical DB module — it handles AES-256-GCM encryption, key migration,
 * and the isEncrypted heuristic. Tests cover:
 *
 *  - CRUD lifecycle (upsert, get, list, delete, has)
 *  - Encrypt/decrypt round-trips (keys survive storage)
 *  - Upsert overwrites (same provider, new key)
 *  - Multi-provider isolation
 *  - isEncrypted heuristic (plaintext API keys vs encrypted blobs)
 *  - migrateUnencryptedKeys (plaintext → encrypted migration)
 *  - Fault injection: corrupted ciphertext, truncated data
 *  - Property-based: round-trip integrity for arbitrary strings
 */

import { test, expect, describe, beforeEach, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as fc from "fast-check";

import { runMigrations } from "../server/db/schema.ts";
import {
  listConnections,
  getApiKey,
  upsertConnection,
  deleteConnection,
  hasConnection,
  migrateUnencryptedKeys,
} from "../server/db/connections.ts";
import {
  ensureEncryptionKey,
  encrypt,
  decrypt,
  isEncrypted,
  isLegacyEncrypted,
} from "../server/lib/crypto.ts";
import type { ProviderName } from "../shared/providers.ts";
import { PROVIDER_IDS } from "../shared/providers.ts";

// ── Test Helpers ──────────────────────────────────────────────

/** Valid provider names for testing. */
const PROVIDERS: ProviderName[] = [...PROVIDER_IDS];

/**
 * We need to chdir into a temp directory so ensureEncryptionKey() writes its
 * .proseus-key file there instead of the project root. The key is cached
 * module-level, so we only need to do this once for the entire test file.
 */
let tmpDir: string;
let originalCwd: string;

beforeAll(async () => {
  originalCwd = process.cwd();
  tmpDir = await mkdtemp(join(tmpdir(), "proseus-conn-test-"));
  process.chdir(tmpDir);
  await ensureEncryptionKey();
});

afterAll(async () => {
  process.chdir(originalCwd);
  await rm(tmpDir, { recursive: true, force: true });
});

// ── Tests ─────────────────────────────────────────────────────

describe("connections", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db);
  });

  // ────────────────────────────────────────────
  // CRUD lifecycle
  // ────────────────────────────────────────────

  describe("upsertConnection", () => {
    test("inserts a new connection and returns the row", async () => {
      const row = await upsertConnection(db, "openrouter", "sk-or-v1-test123");

      expect(row.provider).toBe("openrouter");
      expect(row.api_key).not.toBe("sk-or-v1-test123"); // should be encrypted
      expect(row.created_at).toBeGreaterThan(0);
      expect(row.updated_at).toBe(row.created_at);
    });

    test("encrypted key has v1: prefix and valid base64 payload", async () => {
      const row = await upsertConnection(db, "anthropic", "sk-ant-test456");

      // Should have the v1: prefix
      expect(row.api_key.startsWith("v1:")).toBe(true);

      // Payload after prefix should be valid base64
      const payload = row.api_key.slice(3);
      const decoded = atob(payload);
      // AES-GCM output: 12 byte IV + at least 1 byte ciphertext + 16 byte auth tag
      expect(decoded.length).toBeGreaterThanOrEqual(12 + 1 + 16);
    });

    test("upsert overwrites existing key for same provider", async () => {
      await upsertConnection(db, "openai", "sk-first-key");
      const second = await upsertConnection(db, "openai", "sk-second-key");

      // Only one row for openai
      const rows = db
        .query("SELECT COUNT(*) as cnt FROM connections WHERE provider = 'openai'")
        .get() as { cnt: number };
      expect(rows.cnt).toBe(1);

      // The stored key should decrypt to the second value
      const retrieved = await getApiKey(db, "openai");
      expect(retrieved).toBe("sk-second-key");
    });

    test("upsert updates updated_at but not created_at on overwrite", async () => {
      const first = await upsertConnection(db, "gemini", "AIzaFirst");

      // Small delay to ensure timestamp difference
      await Bun.sleep(5);

      const second = await upsertConnection(db, "gemini", "AIzaSecond");

      // The returned row reflects the new insert's timestamp (ON CONFLICT replaces)
      // But the DB row's created_at should be the original
      const dbRow = db
        .query("SELECT created_at, updated_at FROM connections WHERE provider = 'gemini'")
        .get() as { created_at: number; updated_at: number };

      // updated_at should be >= first.created_at
      expect(dbRow.updated_at).toBeGreaterThanOrEqual(first.created_at);
    });

    // ── BUG: return value contract mismatch ────────────────────
    // upsertConnection always returns { created_at: now } even on updates.
    // But the DB keeps the original created_at (ON CONFLICT only updates
    // api_key + updated_at). So the returned row disagrees with the DB.
    // This test encodes the DESIRED behavior: returned created_at must
    // match what's actually in the database.
    test("BUG: upsert return value should match DB state on conflict", async () => {
      const first = await upsertConnection(db, "xai", "xai-original");
      const originalCreatedAt = first.created_at;

      await Bun.sleep(10);

      const second = await upsertConnection(db, "xai", "xai-updated");

      // Check what the DB actually has
      const dbRow = db
        .query("SELECT created_at, updated_at FROM connections WHERE provider = 'xai'")
        .get() as { created_at: number; updated_at: number };

      // DB should preserve original created_at
      expect(dbRow.created_at).toBe(originalCreatedAt);

      // BUG: The returned row's created_at should match the DB, not be a new timestamp
      // Currently second.created_at === second.updated_at (both are `now`),
      // but the DB's created_at is the original value.
      expect(second.created_at).toBe(originalCreatedAt);
      expect(second.updated_at).toBeGreaterThan(originalCreatedAt);
    });

    test("different providers are isolated", async () => {
      await upsertConnection(db, "openrouter", "sk-or-v1-aaaa");
      await upsertConnection(db, "anthropic", "sk-ant-bbbb");
      await upsertConnection(db, "xai", "xai-cccc");

      expect(await getApiKey(db, "openrouter")).toBe("sk-or-v1-aaaa");
      expect(await getApiKey(db, "anthropic")).toBe("sk-ant-bbbb");
      expect(await getApiKey(db, "xai")).toBe("xai-cccc");
    });
  });

  // ────────────────────────────────────────────
  // getApiKey
  // ────────────────────────────────────────────

  describe("getApiKey", () => {
    test("returns null for non-existent provider", async () => {
      const result = await getApiKey(db, "openai");
      expect(result).toBeNull();
    });

    test("round-trips through encrypt → store → decrypt", async () => {
      const originalKey = "sk-or-v1-abcdef1234567890";
      await upsertConnection(db, "openrouter", originalKey);
      const retrieved = await getApiKey(db, "openrouter");
      expect(retrieved).toBe(originalKey);
    });

    test("handles plaintext keys (pre-migration)", async () => {
      // Directly insert a plaintext key (simulating old data before migration)
      const now = Date.now();
      db.query(
        `INSERT INTO connections (provider, api_key, created_at, updated_at)
         VALUES ($provider, $apiKey, $now, $now)`,
      ).run({ $provider: "xai", $apiKey: "xai-plaintext-key", $now: now });

      // getApiKey should detect it's plaintext and return as-is
      const key = await getApiKey(db, "xai");
      expect(key).toBe("xai-plaintext-key");
    });

    test("each encryption produces different ciphertext (random IV)", async () => {
      const key = "sk-ant-same-key-twice";
      const encrypted1 = await encrypt(key);
      const encrypted2 = await encrypt(key);

      // Different ciphertext (different random IV each time)
      expect(encrypted1).not.toBe(encrypted2);

      // But both decrypt to the same value
      expect(await decrypt(encrypted1)).toBe(key);
      expect(await decrypt(encrypted2)).toBe(key);
    });
  });

  // ────────────────────────────────────────────
  // listConnections
  // ────────────────────────────────────────────

  describe("listConnections", () => {
    test("returns empty array when no connections exist", () => {
      const result = listConnections(db);
      expect(result).toEqual([]);
    });

    test("returns status objects without exposing keys", async () => {
      await upsertConnection(db, "openrouter", "sk-or-v1-secret");
      const list = listConnections(db);

      expect(list).toHaveLength(1);
      const first = list[0]!;
      expect(first.provider).toBe("openrouter");
      expect(first.connected).toBe(true);
      expect(first.updated_at).toBeGreaterThan(0);

      // Critically: no api_key field
      expect((first as any).api_key).toBeUndefined();
    });

    test("lists multiple providers ordered by updated_at DESC", async () => {
      await upsertConnection(db, "openai", "sk-first");
      await Bun.sleep(5);
      await upsertConnection(db, "anthropic", "sk-ant-second");
      await Bun.sleep(5);
      await upsertConnection(db, "xai", "xai-third");

      const list = listConnections(db);
      expect(list).toHaveLength(3);
      // Most recently updated first
      expect(list[0]!.provider).toBe("xai");
      expect(list[1]!.provider).toBe("anthropic");
      expect(list[2]!.provider).toBe("openai");
    });
  });

  // ────────────────────────────────────────────
  // deleteConnection
  // ────────────────────────────────────────────

  describe("deleteConnection", () => {
    test("deletes existing connection and returns true", async () => {
      await upsertConnection(db, "openrouter", "sk-or-v1-delete-me");
      const deleted = deleteConnection(db, "openrouter");
      expect(deleted).toBe(true);

      // Verify it's gone
      expect(await getApiKey(db, "openrouter")).toBeNull();
      expect(hasConnection(db, "openrouter")).toBe(false);
    });

    test("returns false for non-existent provider", () => {
      const deleted = deleteConnection(db, "anthropic");
      expect(deleted).toBe(false);
    });

    test("delete one provider does not affect others", async () => {
      await upsertConnection(db, "openai", "sk-keep");
      await upsertConnection(db, "xai", "xai-delete");

      deleteConnection(db, "xai");

      expect(await getApiKey(db, "openai")).toBe("sk-keep");
      expect(await getApiKey(db, "xai")).toBeNull();
    });
  });

  // ────────────────────────────────────────────
  // hasConnection
  // ────────────────────────────────────────────

  describe("hasConnection", () => {
    test("returns false when no connection exists", () => {
      expect(hasConnection(db, "gemini")).toBe(false);
    });

    test("returns true after upsert", async () => {
      await upsertConnection(db, "gemini", "AIza-test");
      expect(hasConnection(db, "gemini")).toBe(true);
    });

    test("returns false after delete", async () => {
      await upsertConnection(db, "gemini", "AIza-test");
      deleteConnection(db, "gemini");
      expect(hasConnection(db, "gemini")).toBe(false);
    });
  });

  // ────────────────────────────────────────────
  // isEncrypted heuristic
  // ────────────────────────────────────────────

  describe("isEncrypted", () => {
    test("plaintext API keys with hyphens → false", () => {
      expect(isEncrypted("sk-or-v1-abc123")).toBe(false);
      expect(isEncrypted("sk-ant-api03-xyz")).toBe(false);
      expect(isEncrypted("sk-proj-abc")).toBe(false);
      expect(isEncrypted("xai-some-key")).toBe(false);
    });

    test("short base64 strings → false (too short for IV+ciphertext+tag)", () => {
      // Valid base64, but shorter than IV(12) + 1 + authTag(16) = 29 bytes
      const shortB64 = btoa("short"); // 5 bytes
      expect(isEncrypted(shortB64)).toBe(false);
    });

    test("actually encrypted values → true", async () => {
      const encrypted = await encrypt("test-key");
      expect(isEncrypted(encrypted)).toBe(true);
    });

    test("empty string → false", () => {
      expect(isEncrypted("")).toBe(false);
    });

    test("non-base64 strings → false", () => {
      expect(isEncrypted("not!valid@base64")).toBe(false);
      expect(isEncrypted("hello world with spaces")).toBe(false);
    });

    test("Gemini-style keys (AIza...) without hyphens: depends on length", () => {
      // Short AIza key — too short to be encrypted
      expect(isEncrypted("AIzaSyBxxx")).toBe(false);

      // A long base64-valid string that's >= 29 bytes decoded could be ambiguous,
      // but real Gemini keys contain non-base64 chars (underscores) typically.
      // The heuristic relies on real keys having hyphens or being short.
    });

    // ── BUG: isEncrypted false-positive on base64-looking plaintext ──
    // A plaintext API key that happens to be valid base64 with no hyphens
    // and decodes to >= 29 bytes will be misclassified as encrypted.
    // getApiKey would then try to decrypt it and throw.
    // This test encodes the DESIRED behavior: a known-plaintext key that
    // is valid base64 should NOT be classified as encrypted.
    test("BUG: long base64-valid plaintext key is misclassified as encrypted", () => {
      // This is a 44-char base64 string (decodes to 32 bytes, well above 29).
      // It contains no hyphens. It's valid base64. But it was never encrypted.
      const fakeKey = "QUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFB";
      // Verify it's valid base64 that decodes long enough
      const decoded = atob(fakeKey);
      expect(decoded.length).toBeGreaterThanOrEqual(29);

      // DESIRED: isEncrypted should return false for this plaintext key
      // ACTUAL BUG: isEncrypted returns true because it's long valid base64
      expect(isEncrypted(fakeKey)).toBe(false);
    });
  });

  // ────────────────────────────────────────────
  // migrateUnencryptedKeys
  // ────────────────────────────────────────────

  describe("migrateUnencryptedKeys", () => {
    test("migrates plaintext keys to encrypted form", async () => {
      const now = Date.now();
      // Insert plaintext keys directly (simulating pre-encryption data)
      const plaintextKeys: [ProviderName, string][] = [
        ["openrouter", "sk-or-v1-plaintext1"],
        ["anthropic", "sk-ant-plaintext2"],
        ["xai", "xai-plaintext3"],
      ];

      for (const [provider, key] of plaintextKeys) {
        db.query(
          `INSERT INTO connections (provider, api_key, created_at, updated_at)
           VALUES ($provider, $apiKey, $now, $now)`,
        ).run({ $provider: provider, $apiKey: key, $now: now });
      }

      const migrated = await migrateUnencryptedKeys(db);
      expect(migrated).toBe(3);

      // Verify all keys are now encrypted in storage but decrypt correctly
      for (const [provider, originalKey] of plaintextKeys) {
        const rawRow = db
          .query("SELECT api_key FROM connections WHERE provider = $p")
          .get({ $p: provider }) as { api_key: string };

        // Stored value should now be encrypted (no hyphens, valid base64)
        expect(isEncrypted(rawRow.api_key)).toBe(true);

        // But getApiKey should transparently decrypt
        const retrieved = await getApiKey(db, provider);
        expect(retrieved).toBe(originalKey);
      }
    });

    test("skips already-encrypted keys", async () => {
      // Insert an encrypted key via normal upsert
      await upsertConnection(db, "openai", "sk-already-encrypted");

      // Then insert a plaintext one
      const now = Date.now();
      db.query(
        `INSERT INTO connections (provider, api_key, created_at, updated_at)
         VALUES ('xai', 'xai-needs-migration', $now, $now)`,
      ).run({ $now: now });

      const migrated = await migrateUnencryptedKeys(db);
      expect(migrated).toBe(1); // only the xai one

      // Both should still work
      expect(await getApiKey(db, "openai")).toBe("sk-already-encrypted");
      expect(await getApiKey(db, "xai")).toBe("xai-needs-migration");
    });

    test("returns 0 when all keys are already encrypted", async () => {
      await upsertConnection(db, "openrouter", "sk-or-v1-enc");
      await upsertConnection(db, "anthropic", "sk-ant-enc");

      const migrated = await migrateUnencryptedKeys(db);
      expect(migrated).toBe(0);
    });

    test("returns 0 when table is empty", async () => {
      const migrated = await migrateUnencryptedKeys(db);
      expect(migrated).toBe(0);
    });

    test("idempotent — running twice does not re-migrate", async () => {
      const now = Date.now();
      db.query(
        `INSERT INTO connections (provider, api_key, created_at, updated_at)
         VALUES ('gemini', 'AIza-plaintext', $now, $now)`,
      ).run({ $now: now });

      const first = await migrateUnencryptedKeys(db);
      expect(first).toBe(1);

      const second = await migrateUnencryptedKeys(db);
      expect(second).toBe(0);

      // Key still decrypts correctly
      expect(await getApiKey(db, "gemini")).toBe("AIza-plaintext");
    });
  });

  // ────────────────────────────────────────────
  // Fault injection
  // ────────────────────────────────────────────

  describe("fault injection", () => {
    test("decrypt throws on corrupted ciphertext", async () => {
      const encrypted = await encrypt("valid-key");

      // Strip v1: prefix to get raw base64, corrupt it, then re-prefix
      const payload = encrypted.slice(3); // remove "v1:"
      const decoded = Uint8Array.from(atob(payload), (c) => c.charCodeAt(0));
      // Flip bytes at position 15-20 (well into ciphertext/auth tag area)
      for (let i = 15; i < Math.min(20, decoded.length); i++) {
        decoded[i] = decoded[i]! ^ 0xff;
      }
      const corrupted = "v1:" + btoa(String.fromCharCode(...decoded));

      await expect(decrypt(corrupted)).rejects.toThrow();
    });

    test("decrypt throws on truncated data (IV only)", async () => {
      // Create a string that's only 12 bytes (just an IV, no ciphertext)
      const ivOnly = new Uint8Array(12);
      crypto.getRandomValues(ivOnly);
      const truncated = btoa(String.fromCharCode(...ivOnly));

      await expect(decrypt(truncated)).rejects.toThrow();
    });

    test("decrypt throws on empty base64", async () => {
      const emptyB64 = btoa(""); // empty string → ""
      await expect(decrypt(emptyB64)).rejects.toThrow();
    });

    test("decrypt throws on very short data", async () => {
      const shortData = btoa("abc"); // only 3 bytes
      await expect(decrypt(shortData)).rejects.toThrow();
    });

    test("corrupted key in DB still allows other providers to work", async () => {
      // Insert a valid key
      await upsertConnection(db, "openrouter", "sk-or-v1-valid");

      // Manually insert garbage with v1: prefix (simulates corrupted encrypted value)
      const now = Date.now();
      const garbagePayload = btoa(String.fromCharCode(
        ...new Uint8Array(50).map(() => Math.floor(Math.random() * 256))
      ));
      const garbage = "v1:" + garbagePayload;
      db.query(
        `INSERT INTO connections (provider, api_key, created_at, updated_at)
         VALUES ('anthropic', $apiKey, $now, $now)`,
      ).run({ $apiKey: garbage, $now: now });

      // The valid key should still work
      expect(await getApiKey(db, "openrouter")).toBe("sk-or-v1-valid");

      // The corrupted key should throw when decrypted
      expect(isEncrypted(garbage)).toBe(true);
      await expect(getApiKey(db, "anthropic")).rejects.toThrow();
    });
  });

  // ────────────────────────────────────────────
  // Full lifecycle integration
  // ────────────────────────────────────────────

  describe("full lifecycle", () => {
    test("create → read → update → list → delete → verify gone", async () => {
      // Create
      await upsertConnection(db, "openrouter", "sk-or-v1-initial");
      expect(hasConnection(db, "openrouter")).toBe(true);

      // Read
      expect(await getApiKey(db, "openrouter")).toBe("sk-or-v1-initial");

      // Update
      await upsertConnection(db, "openrouter", "sk-or-v1-updated");
      expect(await getApiKey(db, "openrouter")).toBe("sk-or-v1-updated");

      // List
      const list = listConnections(db);
      expect(list).toHaveLength(1);
      expect(list[0]!.provider).toBe("openrouter");
      expect(list[0]!.connected).toBe(true);

      // Delete
      expect(deleteConnection(db, "openrouter")).toBe(true);

      // Verify gone
      expect(hasConnection(db, "openrouter")).toBe(false);
      expect(await getApiKey(db, "openrouter")).toBeNull();
      expect(listConnections(db)).toHaveLength(0);
    });

    test("all 5 providers can coexist", async () => {
      const keys: Record<ProviderName, string> = {
        openrouter: "sk-or-v1-multi",
        anthropic: "sk-ant-multi",
        openai: "sk-multi",
        gemini: "AIza-multi",
        xai: "xai-multi",
      };

      for (const [provider, key] of Object.entries(keys)) {
        await upsertConnection(db, provider as ProviderName, key);
      }

      // All should be present
      const list = listConnections(db);
      expect(list).toHaveLength(5);

      // All should decrypt correctly
      for (const [provider, expectedKey] of Object.entries(keys)) {
        expect(await getApiKey(db, provider as ProviderName)).toBe(expectedKey);
      }

      // Delete one — others unaffected
      deleteConnection(db, "gemini");
      expect(listConnections(db)).toHaveLength(4);
      expect(await getApiKey(db, "gemini")).toBeNull();
      expect(await getApiKey(db, "openai")).toBe("sk-multi");
    });
  });

  // ────────────────────────────────────────────
  // Property-based tests (fast-check)
  // ────────────────────────────────────────────

  describe("property-based", () => {
    test("encrypt → decrypt round-trip for arbitrary strings", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 500 }),
          async (plaintext) => {
            const encrypted = await encrypt(plaintext);
            const decrypted = await decrypt(encrypted);
            expect(decrypted).toBe(plaintext);
          },
        ),
        { numRuns: 50 },
      );
    });

    test("encrypted output always has v1: prefix with valid base64 payload", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 200 }),
          async (plaintext) => {
            const encrypted = await encrypt(plaintext);

            // Should have the v1: prefix
            expect(encrypted.startsWith("v1:")).toBe(true);

            // Payload after prefix should be valid base64
            const payload = encrypted.slice(3);
            const decoded = atob(payload);
            // IV(12) + at least 1 byte ciphertext + authTag(16) = 29 min
            expect(decoded.length).toBeGreaterThanOrEqual(29);

            // isEncrypted should detect it
            expect(isEncrypted(encrypted)).toBe(true);
          },
        ),
        { numRuns: 50 },
      );
    });

    test("upsert → getApiKey round-trip for arbitrary API key strings", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...PROVIDERS),
          fc.string({ minLength: 1, maxLength: 200 }),
          async (provider, apiKey) => {
            const freshDb = new Database(":memory:");
            runMigrations(freshDb);

            await upsertConnection(freshDb, provider, apiKey);
            const retrieved = await getApiKey(freshDb, provider);
            expect(retrieved).toBe(apiKey);

            freshDb.close();
          },
        ),
        { numRuns: 30 },
      );
    });

    test("isEncrypted correctly classifies typical API key patterns", () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            "sk-or-v1-",
            "sk-ant-",
            "sk-",
            "xai-",
            "sk-proj-",
            "AIza-",
          ),
          fc.stringMatching(/^[0-9a-f]{10,40}$/),
          (prefix, suffix) => {
            const fakeKey = prefix + suffix;
            // All these prefixes contain hyphens → isEncrypted should return false
            expect(isEncrypted(fakeKey)).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    });

    test("double-encrypt does not produce same ciphertext (random IV)", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 100 }),
          async (plaintext) => {
            const a = await encrypt(plaintext);
            const b = await encrypt(plaintext);
            // Extremely unlikely to be equal due to random IV
            expect(a).not.toBe(b);
          },
        ),
        { numRuns: 25 },
      );
    });
  });
});
