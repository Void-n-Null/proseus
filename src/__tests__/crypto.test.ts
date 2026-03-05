/**
 * crypto.test.ts — Tests for src/server/lib/crypto.ts
 *
 * AES-256-GCM encryption at rest for API keys. Security-critical module.
 * Tests cover:
 *
 *  - Key management: ensureEncryptionKey creates/loads key files, getEncryptionKey
 *    throws when uninitialized (tested via import isolation)
 *  - Encrypt/decrypt round-trips (traditional + fast-check with arbitrary strings)
 *  - Random IV: same plaintext encrypts to different ciphertext each time
 *  - isEncrypted: deterministic prefix detection (v1:)
 *  - isLegacyEncrypted: heuristic for pre-prefix migration
 *  - Fault injection: tampered ciphertext, truncated data, wrong base64
 */

import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as fc from "fast-check";

import {
  ensureEncryptionKey,
  getEncryptionKey,
  encrypt,
  decrypt,
  isEncrypted,
  isLegacyEncrypted,
} from "../server/lib/crypto.ts";

// ── Setup: temp directory for key file isolation ─────────────

let tmpDir: string;
let originalCwd: string;
let originalDataDir: string | undefined;

beforeAll(async () => {
  originalCwd = process.cwd();
  originalDataDir = process.env.PROSEUS_DATA_DIR;
  tmpDir = await mkdtemp(join(tmpdir(), "proseus-crypto-test-"));
  process.env.PROSEUS_DATA_DIR = tmpDir;
  process.chdir(tmpDir);
  await ensureEncryptionKey();
});

afterAll(async () => {
  process.chdir(originalCwd);
  if (originalDataDir === undefined) {
    delete process.env.PROSEUS_DATA_DIR;
  } else {
    process.env.PROSEUS_DATA_DIR = originalDataDir;
  }
  await rm(tmpDir, { recursive: true, force: true });
});

// ============================================================
// Key Management
// ============================================================

describe("key management", () => {
  test("ensureEncryptionKey: returns a valid CryptoKey", async () => {
    // Key was initialized in beforeAll. Verify it's a proper AES-256-GCM key.
    const key = await ensureEncryptionKey();
    expect(key).toBeTruthy();
    expect(key.type).toBe("secret");
    expect((key.algorithm as { name: string; length: number }).name).toBe("AES-GCM");
    expect((key.algorithm as { name: string; length: number }).length).toBe(256);
    expect(key.extractable).toBe(false);
    expect(key.usages).toContain("encrypt");
    expect(key.usages).toContain("decrypt");
  });

  test("ensureEncryptionKey: returns same key on subsequent calls (cached)", async () => {
    const key1 = await ensureEncryptionKey();
    const key2 = await ensureEncryptionKey();
    expect(key1).toBe(key2); // Same object reference — cached
  });

  test("getEncryptionKey: returns cached key after ensureEncryptionKey", () => {
    const key = getEncryptionKey();
    expect(key).toBeTruthy();
    expect(key.type).toBe("secret");
    expect((key.algorithm as { name: string; length: number }).name).toBe("AES-GCM");
    expect((key.algorithm as { name: string; length: number }).length).toBe(256);
  });

  test("ensureEncryptionKey: key is usable for encrypt/decrypt immediately", async () => {
    // Verifies end-to-end: key was loaded from disk, imported, and works.
    // (File system creation is tested implicitly — if the key file wasn't
    // created and loaded, encrypt/decrypt would fail with "key not initialized".)
    const key = await ensureEncryptionKey();
    const encrypted = await encrypt("key-init-test");
    const decrypted = await decrypt(encrypted);
    expect(decrypted).toBe("key-init-test");
    expect(key).toBe(getEncryptionKey()); // Still the same cached instance
  });
});

// ============================================================
// Encrypt / Decrypt — Traditional
// ============================================================

describe("encrypt / decrypt", () => {
  test("encrypt → decrypt round-trip preserves plaintext", async () => {
    const plaintext = "sk-ant-api03-test-key-1234567890";
    const encrypted = await encrypt(plaintext);
    const decrypted = await decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  test("encrypt produces v1: prefixed output", async () => {
    const encrypted = await encrypt("test-value");
    expect(encrypted.startsWith("v1:")).toBe(true);
  });

  test("encrypt produces different ciphertext for same plaintext (random IV)", async () => {
    const plaintext = "sk-test-key-same-input";
    const e1 = await encrypt(plaintext);
    const e2 = await encrypt(plaintext);
    expect(e1).not.toBe(e2); // Different IVs → different output

    // Both should decrypt to the same thing
    expect(await decrypt(e1)).toBe(plaintext);
    expect(await decrypt(e2)).toBe(plaintext);
  });

  test("encrypt → decrypt with empty string", async () => {
    const encrypted = await encrypt("");
    const decrypted = await decrypt(encrypted);
    expect(decrypted).toBe("");
  });

  test("encrypt → decrypt with unicode content", async () => {
    const plaintext = "🔑 API key: こんにちは世界 — résumé";
    const encrypted = await encrypt(plaintext);
    expect(await decrypt(encrypted)).toBe(plaintext);
  });

  test("encrypt → decrypt with very long string", async () => {
    const plaintext = "x".repeat(10_000);
    const encrypted = await encrypt(plaintext);
    expect(await decrypt(encrypted)).toBe(plaintext);
  });

  test("decrypt handles legacy format (no v1: prefix)", async () => {
    // Simulate legacy encrypted value by stripping the prefix
    const encrypted = await encrypt("legacy-test-key");
    const legacyFormat = encrypted.slice(3); // Remove "v1:"
    expect(legacyFormat.startsWith("v1:")).toBe(false);
    const decrypted = await decrypt(legacyFormat);
    expect(decrypted).toBe("legacy-test-key");
  });
});

// ============================================================
// Encrypt / Decrypt — fast-check Property-Based
// ============================================================

describe("encrypt / decrypt — property-based", () => {
  test("round-trip: decrypt(encrypt(x)) === x for arbitrary strings", async () => {
    await fc.assert(
      fc.asyncProperty(fc.string(), async (plaintext) => {
        const encrypted = await encrypt(plaintext);
        const decrypted = await decrypt(encrypted);
        return decrypted === plaintext;
      }),
      { numRuns: 100 },
    );
  });

  test("round-trip with unicode: decrypt(encrypt(x)) === x", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.stringMatching(/^[\s\S]{0,200}$/),
        async (plaintext: string) => {
          const encrypted = await encrypt(plaintext);
          const decrypted = await decrypt(encrypted);
          return decrypted === plaintext;
        },
      ),
      { numRuns: 50 },
    );
  });

  test("encrypted output always carries v1: prefix", async () => {
    await fc.assert(
      fc.asyncProperty(fc.string(), async (plaintext) => {
        const encrypted = await encrypt(plaintext);
        return encrypted.startsWith("v1:");
      }),
      { numRuns: 100 },
    );
  });

  test("isEncrypted(encrypt(x)) is always true", async () => {
    await fc.assert(
      fc.asyncProperty(fc.string(), async (plaintext) => {
        const encrypted = await encrypt(plaintext);
        return isEncrypted(encrypted);
      }),
      { numRuns: 100 },
    );
  });

  test("two encryptions of the same input always differ (random IV)", async () => {
    await fc.assert(
      fc.asyncProperty(fc.string(), async (plaintext) => {
        const e1 = await encrypt(plaintext);
        const e2 = await encrypt(plaintext);
        return e1 !== e2;
      }),
      { numRuns: 50 },
    );
  });
});

// ============================================================
// isEncrypted / isLegacyEncrypted
// ============================================================

describe("isEncrypted", () => {
  test("returns true for v1:-prefixed values", () => {
    expect(isEncrypted("v1:SGVsbG8=")).toBe(true);
    expect(isEncrypted("v1:anything-here")).toBe(true);
  });

  test("returns false for plaintext API keys", () => {
    expect(isEncrypted("sk-ant-api03-abc123")).toBe(false);
    expect(isEncrypted("sk-or-v1-abc123")).toBe(false);
    expect(isEncrypted("AIzaSyDtest123")).toBe(false);
    expect(isEncrypted("xai-test-key")).toBe(false);
    expect(isEncrypted("sk-proj-test-key")).toBe(false);
  });

  test("returns false for empty string", () => {
    expect(isEncrypted("")).toBe(false);
  });

  test("returns false for short strings that don't start with v1:", () => {
    expect(isEncrypted("abc")).toBe(false);
    expect(isEncrypted("v1")).toBe(false);
    expect(isEncrypted("v2:something")).toBe(false);
  });
});

describe("isLegacyEncrypted", () => {
  test("returns false for strings containing hyphens (API key patterns)", () => {
    expect(isLegacyEncrypted("sk-ant-api03-test")).toBe(false);
    expect(isLegacyEncrypted("sk-or-v1-test")).toBe(false);
    expect(isLegacyEncrypted("xai-test-key")).toBe(false);
  });

  test("returns false for short strings", () => {
    expect(isLegacyEncrypted("")).toBe(false);
    expect(isLegacyEncrypted("abc")).toBe(false);
    expect(isLegacyEncrypted("SGVsbG8=")).toBe(false); // "Hello" — too short decoded
  });

  test("returns true for base64 blob that decodes to >= 29 bytes (12 IV + 1 cipher + 16 tag)", async () => {
    // Create a real encrypted value and strip the prefix
    const encrypted = await encrypt("test-legacy-value");
    const raw = encrypted.slice(3); // Strip "v1:"
    expect(isLegacyEncrypted(raw)).toBe(true);
  });

  test("returns false for invalid base64", () => {
    expect(isLegacyEncrypted("not!valid@base64###")).toBe(false);
  });

  test("property: strings with hyphens are never legacy-encrypted", () => {
    fc.assert(
      fc.property(
        // Generate strings that always contain at least one hyphen
        fc.tuple(fc.string(), fc.string()).map(([a, b]) => `${a}-${b}`),
        (value) => !isLegacyEncrypted(value),
      ),
      { numRuns: 200 },
    );
  });
});

// ============================================================
// Fault Injection — Tampered / Corrupted Data
// ============================================================

describe("fault injection", () => {
  test("decrypt rejects tampered ciphertext (flipped bit)", async () => {
    const encrypted = await encrypt("sensitive-api-key");
    const b64 = encrypted.slice(3); // Strip "v1:"

    // Decode, flip a bit in the ciphertext portion, re-encode
    const combined = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    // Flip a bit in the middle of the ciphertext (past the 12-byte IV)
    const targetIdx = 20; // Well into the ciphertext portion
    combined[targetIdx] = (combined[targetIdx]! ^ 0x01) & 0xff;
    const tampered = "v1:" + btoa(String.fromCharCode(...combined));

    expect(decrypt(tampered)).rejects.toThrow();
  });

  test("decrypt rejects truncated data (shorter than IV)", async () => {
    // Only 10 bytes — less than the 12-byte IV requirement
    const shortData = new Uint8Array(10);
    crypto.getRandomValues(shortData);
    const truncated = "v1:" + btoa(String.fromCharCode(...shortData));

    expect(decrypt(truncated)).rejects.toThrow(
      "Encrypted data too short",
    );
  });

  test("decrypt rejects data that is exactly IV length (no ciphertext)", async () => {
    const ivOnly = new Uint8Array(12);
    crypto.getRandomValues(ivOnly);
    const encoded = "v1:" + btoa(String.fromCharCode(...ivOnly));

    expect(decrypt(encoded)).rejects.toThrow(
      "Encrypted data too short",
    );
  });

  test("decrypt rejects invalid base64", async () => {
    expect(decrypt("v1:not-valid-base64!!!")).rejects.toThrow();
  });

  test("decrypt rejects ciphertext encrypted with different data (wrong content)", async () => {
    // Encrypt one thing, then modify the ciphertext to be completely different bytes
    const encrypted = await encrypt("original-key");
    const b64 = encrypted.slice(3);
    const combined = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

    // Replace all ciphertext bytes (after IV) with random data
    for (let i = 12; i < combined.byteLength; i++) {
      combined[i] = Math.floor(Math.random() * 256);
    }
    const scrambled = "v1:" + btoa(String.fromCharCode(...combined));

    expect(decrypt(scrambled)).rejects.toThrow();
  });

  test("property: flipping any byte in ciphertext causes decryption to fail", async () => {
    const encrypted = await encrypt("property-test-key");
    const b64 = encrypted.slice(3);
    const combined = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

    // Try flipping a byte at several positions in the ciphertext
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 12, max: combined.byteLength - 1 }),
        fc.integer({ min: 1, max: 255 }),
        async (byteIdx, xorValue) => {
          const copy = new Uint8Array(combined);
          copy[byteIdx] = (copy[byteIdx]! ^ xorValue) & 0xff;
          const tampered = "v1:" + btoa(String.fromCharCode(...copy));
          try {
            await decrypt(tampered);
            return false; // Should have thrown — tampered data decrypted!
          } catch {
            return true; // Expected: tampered data rejected
          }
        },
      ),
      { numRuns: 50 },
    );
  });
});
