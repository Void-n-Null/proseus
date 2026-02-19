/**
 * Encryption at rest for API keys — AES-256-GCM via Web Crypto API.
 *
 * The encryption key is a 256-bit random value stored in a separate file
 * (`.proseus-key`) next to the SQLite database. This means leaking the
 * database alone does not expose API keys — you need both files.
 *
 * Format of encrypted values stored in SQLite:
 *   base64(iv || ciphertext || authTag)
 *
 * - 12-byte random IV per encryption (AES-GCM standard)
 * - AES-256-GCM provides authenticated encryption (tamper detection)
 * - Each call to encrypt() produces different output even for identical input
 *
 * The key file is generated automatically on first use and must be
 * added to .gitignore (handled by the project's existing *.key pattern
 * or explicitly listed).
 */

const KEY_FILE = ".proseus-key";
const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 256; // bits
const IV_LENGTH = 12; // bytes — AES-GCM standard

/** Cached CryptoKey instance — loaded once, reused for the process lifetime. */
let cachedKey: CryptoKey | null = null;

// ============================================
// Key management
// ============================================

/**
 * Ensure the encryption key file exists. If not, generate a new random
 * 256-bit key and write it to disk. Returns the imported CryptoKey.
 *
 * Call this once at server startup (e.g., in db/index.ts).
 */
export async function ensureEncryptionKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;

  const keyFile = Bun.file(KEY_FILE);
  let rawKeyB64: string;

  if (await keyFile.exists()) {
    rawKeyB64 = (await keyFile.text()).trim();
  } else {
    // Generate a new random key
    const rawKey = new Uint8Array(KEY_LENGTH / 8);
    crypto.getRandomValues(rawKey);
    rawKeyB64 = btoa(String.fromCharCode(...rawKey));
    await Bun.write(KEY_FILE, rawKeyB64 + "\n", { mode: 0o600 });
    console.log("[crypto] Generated new encryption key at", KEY_FILE);
  }

  // Import as CryptoKey
  const rawBytes = Uint8Array.from(atob(rawKeyB64), (c) => c.charCodeAt(0));
  cachedKey = await crypto.subtle.importKey(
    "raw",
    rawBytes,
    { name: ALGORITHM, length: KEY_LENGTH },
    false, // not extractable
    ["encrypt", "decrypt"],
  );

  return cachedKey;
}

/**
 * Get the cached encryption key. Throws if ensureEncryptionKey() hasn't
 * been called yet. Use this in hot paths where you can't await.
 */
export function getEncryptionKey(): CryptoKey {
  if (!cachedKey) {
    throw new Error(
      "Encryption key not initialized. Call ensureEncryptionKey() at startup.",
    );
  }
  return cachedKey;
}

// ============================================
// Encrypt / Decrypt
// ============================================

/**
 * Encrypt a plaintext string. Returns a base64-encoded string containing
 * the IV + ciphertext + auth tag (all concatenated).
 */
export async function encrypt(plaintext: string): Promise<string> {
  const key = getEncryptionKey();
  const iv = new Uint8Array(IV_LENGTH);
  crypto.getRandomValues(iv);

  const encoded = new TextEncoder().encode(plaintext);
  const cipherBuf = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    encoded,
  );

  // Concatenate: iv || ciphertext+authTag
  const combined = new Uint8Array(IV_LENGTH + cipherBuf.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipherBuf), IV_LENGTH);

  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt a base64-encoded encrypted value back to the original plaintext.
 * Throws if the data is tampered or the key is wrong.
 */
export async function decrypt(encrypted: string): Promise<string> {
  const key = getEncryptionKey();
  const combined = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));

  if (combined.byteLength <= IV_LENGTH) {
    throw new Error("Encrypted data too short — missing IV or ciphertext");
  }

  const iv = combined.slice(0, IV_LENGTH);
  const ciphertext = combined.slice(IV_LENGTH);

  const plainBuf = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    key,
    ciphertext,
  );

  return new TextDecoder().decode(plainBuf);
}

// ============================================
// Detection helper
// ============================================

/**
 * Heuristic to detect if a stored value is already encrypted (base64 of
 * IV+ciphertext) vs plaintext. Encrypted values are always valid base64
 * and decode to at least IV_LENGTH+1 bytes. Plaintext API keys (sk-...,
 * AIza..., xai-...) contain characters like `-` that aren't in standard
 * base64, so this is reliable.
 */
export function isEncrypted(value: string): boolean {
  // Plaintext keys contain hyphens, underscores in non-base64 positions, etc.
  // Quick check: if it contains a hyphen, it's definitely plaintext.
  if (value.includes("-")) return false;

  try {
    const decoded = atob(value);
    // Must be long enough for IV + at least 1 byte of ciphertext + 16 byte auth tag
    return decoded.length >= IV_LENGTH + 1 + 16;
  } catch {
    return false; // Not valid base64 → plaintext
  }
}
