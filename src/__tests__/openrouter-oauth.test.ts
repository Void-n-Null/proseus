import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { installHappyDom } from "./test-dom.ts";

const { restore } = installHappyDom("https://proseus.test/settings");
const {
  cleanOAuthCodeFromUrl,
  exchangeOpenRouterCode,
  getOAuthCodeFromUrl,
  startOpenRouterOAuth,
} = await import("../client/lib/openrouter-oauth.ts");

const STORAGE_KEY = "proseus_or_pkce_verifier";

afterAll(() => {
  restore();
});

beforeEach(() => {
  sessionStorage.clear();
  window.location.href = "https://proseus.test/settings?tab=connections";
});

describe("openrouter-oauth", () => {
  test("startOpenRouterOAuth stores a URL-safe verifier and builds the auth URL", async () => {
    await startOpenRouterOAuth("https://proseus.test/oauth/callback");

    const verifier = sessionStorage.getItem(STORAGE_KEY);
    const authUrl = new URL(window.location.href);

    expect(verifier).toBeTruthy();
    expect(verifier!).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(verifier!.length).toBeGreaterThanOrEqual(43);
    expect(verifier!.length).toBeLessThanOrEqual(128);
    expect(authUrl.origin).toBe("https://openrouter.ai");
    expect(authUrl.pathname).toBe("/auth");
    expect(authUrl.searchParams.get("callback_url")).toBe(
      "https://proseus.test/oauth/callback",
    );
    expect(authUrl.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authUrl.searchParams.get("code_challenge")).toBeTruthy();
  });

  test("exchangeOpenRouterCode returns an error when the verifier is missing", async () => {
    expect(await exchangeOpenRouterCode("auth-code")).toEqual({
      error: "Missing PKCE verifier. Please try connecting again.",
    });
  });

  test("exchangeOpenRouterCode posts the verifier and returns the API key", async () => {
    sessionStorage.setItem(STORAGE_KEY, "verifier-123");

    const originalFetch = globalThis.fetch;
    let requestUrl = "";
    let requestInit: RequestInit | undefined;

    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: async (input: RequestInfo | URL, init?: RequestInit) => {
        requestUrl = String(input);
        requestInit = init;
        return new Response(JSON.stringify({ key: "or-key" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    });

    try {
      expect(await exchangeOpenRouterCode("auth-code")).toEqual({ key: "or-key" });
    } finally {
      Object.defineProperty(globalThis, "fetch", {
        configurable: true,
        writable: true,
        value: originalFetch,
      });
    }

    expect(requestUrl).toBe("https://openrouter.ai/api/v1/auth/keys");
    expect(requestInit?.method).toBe("POST");
    expect(String(requestInit?.body)).toContain('"code":"auth-code"');
    expect(String(requestInit?.body)).toContain('"code_verifier":"verifier-123"');
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  test("exchangeOpenRouterCode surfaces API errors and still clears the verifier", async () => {
    sessionStorage.setItem(STORAGE_KEY, "verifier-123");

    const originalFetch = globalThis.fetch;
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: async () =>
        new Response(JSON.stringify({ error: "Invalid authorization code" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
    });

    try {
      expect(await exchangeOpenRouterCode("bad-code")).toEqual({
        error: "Invalid authorization code",
      });
    } finally {
      Object.defineProperty(globalThis, "fetch", {
        configurable: true,
        writable: true,
        value: originalFetch,
      });
    }

    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  test("reads and cleans the OAuth code from the current URL", () => {
    window.location.href = "https://proseus.test/settings?code=oauth-123&tab=connections";

    expect(getOAuthCodeFromUrl()).toBe("oauth-123");

    cleanOAuthCodeFromUrl();

    const url = new URL(window.location.href);
    expect(url.searchParams.get("code")).toBeNull();
    expect(url.searchParams.get("tab")).toBe("connections");
  });
});
