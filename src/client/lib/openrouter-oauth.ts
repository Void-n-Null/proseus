/**
 * OpenRouter OAuth PKCE — client-side flow.
 *
 * The entire OAuth dance happens in the browser:
 * 1. Generate code_verifier + code_challenge (S256)
 * 2. Redirect to OpenRouter /auth with challenge
 * 3. User authorizes, gets redirected back with ?code=
 * 4. Exchange code + verifier for API key via POST /api/v1/auth/keys
 *
 * No server-side routes needed.
 */

const STORAGE_KEY = "proseus_or_pkce_verifier";

// ============================================
// PKCE helpers
// ============================================

/** Generate a random code_verifier (43-128 URL-safe chars). */
function generateCodeVerifier(): string {
  const array = new Uint8Array(48);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

/**
 * SHA-256 hash of the verifier, base64url-encoded → code_challenge.
 *
 * crypto.subtle is only available in secure contexts (HTTPS or localhost).
 * When accessed over plain HTTP on a LAN IP, we fall back to a pure-JS
 * SHA-256 implementation so the OAuth flow still works during development.
 */
async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);

  if (crypto.subtle) {
    const hash = await crypto.subtle.digest("SHA-256", data);
    return base64UrlEncode(new Uint8Array(hash));
  }

  // Fallback: pure-JS SHA-256 for insecure contexts (LAN dev over HTTP)
  const hash = sha256(data);
  return base64UrlEncode(hash);
}

// ============================================
// Pure-JS SHA-256 fallback (insecure contexts)
// ============================================

const K: readonly number[] = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function sha256(input: Uint8Array): Uint8Array {
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

  // Pre-processing: pad message to 512-bit blocks
  const msgLen = input.length;
  const bitLen = msgLen * 8;
  // message + 0x80 byte + padding + 8-byte length
  const totalLen = Math.ceil((msgLen + 9) / 64) * 64;
  const buf = new Uint8Array(totalLen);
  buf.set(input);
  buf[msgLen] = 0x80;
  // Big-endian 64-bit length (only lower 32 bits needed for PKCE verifiers)
  const view = new DataView(buf.buffer);
  view.setUint32(totalLen - 4, bitLen, false);

  // Initial hash values
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

  const w = new Int32Array(64);

  for (let offset = 0; offset < totalLen; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getInt32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15]!, 7) ^ rotr(w[i - 15]!, 18) ^ (w[i - 15]! >>> 3);
      const s1 = rotr(w[i - 2]!, 17) ^ rotr(w[i - 2]!, 19) ^ (w[i - 2]! >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) | 0;
    }

    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;

    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[i]! + w[i]!) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;

      h = g; g = f; f = e; e = (d + temp1) | 0;
      d = c; c = b; b = a; a = (temp1 + temp2) | 0;
    }

    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
  }

  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  outView.setInt32(0, h0, false);  outView.setInt32(4, h1, false);
  outView.setInt32(8, h2, false);  outView.setInt32(12, h3, false);
  outView.setInt32(16, h4, false); outView.setInt32(20, h5, false);
  outView.setInt32(24, h6, false); outView.setInt32(28, h7, false);
  return out;
}

/** Base64url encoding (no padding, URL-safe chars). */
function base64UrlEncode(buffer: Uint8Array): string {
  let binary = "";
  for (const byte of buffer) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ============================================
// OAuth flow
// ============================================

/**
 * Start the OpenRouter OAuth PKCE flow.
 *
 * Generates a code_verifier, stores it in sessionStorage,
 * then redirects the user to OpenRouter's auth page.
 * After authorization, the user is redirected back to `callbackUrl`
 * with a `?code=` query parameter.
 */
export async function startOpenRouterOAuth(callbackUrl?: string): Promise<void> {
  const verifier = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);

  // Persist verifier so we can use it after the redirect
  sessionStorage.setItem(STORAGE_KEY, verifier);

  const callback = callbackUrl ?? window.location.origin + window.location.pathname;
  const authUrl = new URL("https://openrouter.ai/auth");
  authUrl.searchParams.set("callback_url", callback);
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  window.location.href = authUrl.toString();
}

/**
 * Exchange the authorization code for an API key.
 *
 * Reads the code_verifier from sessionStorage, posts to OpenRouter,
 * then returns the API key. Cleans up sessionStorage afterwards.
 *
 * Returns null if the exchange fails.
 */
export async function exchangeOpenRouterCode(
  code: string,
): Promise<{ key: string } | { error: string }> {
  const verifier = sessionStorage.getItem(STORAGE_KEY);
  if (!verifier) {
    return { error: "Missing PKCE verifier. Please try connecting again." };
  }

  try {
    const response = await fetch("https://openrouter.ai/api/v1/auth/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        code_verifier: verifier,
        code_challenge_method: "S256",
      }),
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: string;
        message?: string;
      } | null;
      return {
        error:
          body?.error ??
          body?.message ??
          `OpenRouter returned ${response.status}`,
      };
    }

    const data = (await response.json()) as { key: string };
    return { key: data.key };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "OAuth exchange failed",
    };
  } finally {
    sessionStorage.removeItem(STORAGE_KEY);
  }
}

/**
 * Check if the current URL has an OpenRouter OAuth callback code.
 * Returns the code string or null.
 */
export function getOAuthCodeFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get("code");
}

/**
 * Clean the OAuth code from the URL without a page reload.
 */
export function cleanOAuthCodeFromUrl(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete("code");
  window.history.replaceState({}, "", url.toString());
}
