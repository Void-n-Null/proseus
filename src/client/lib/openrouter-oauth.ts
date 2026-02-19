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

/** SHA-256 hash of the verifier, base64url-encoded → code_challenge. */
async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(hash));
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
