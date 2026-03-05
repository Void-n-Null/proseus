/**
 * api-connections.test.ts — Tests for src/server/routes/connections.ts
 *
 * The connections route handles API key validation + storage. The key challenge
 * is that `validateApiKey` (private to the module) makes external HTTP calls
 * to each provider's API. We mock globalThis.fetch to intercept those calls
 * and simulate success, auth failure, server error, and network failure.
 *
 * Coverage:
 *  - PUT: valid key saves + returns { provider, connected: true }
 *  - PUT: rejects invalid provider name
 *  - PUT: rejects missing / empty / short api_key
 *  - PUT: rejects key when provider validation returns 401/403
 *  - PUT: allows key when provider returns 5xx (graceful degradation)
 *  - PUT: allows key when fetch throws network error
 *  - PUT: provider-specific validation logic (OpenRouter body shape, Gemini query param, xAI 400)
 *  - GET: returns statuses (never raw keys)
 *  - DELETE: removes connection
 *  - DELETE: rejects invalid provider
 *  - Property-based: any valid provider + sufficiently long key succeeds when fetch returns OK
 */

import {
  test,
  expect,
  describe,
  beforeEach,
  beforeAll,
  afterAll,
  afterEach,
  mock,
} from "bun:test";
import { Hono } from "hono";
import { Database } from "bun:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as fc from "fast-check";

import { runMigrations } from "../server/db/schema.ts";
import { createConnectionsRouter } from "../server/routes/connections.ts";
import { ensureEncryptionKey } from "../server/lib/crypto.ts";
import { PROVIDER_IDS, type ProviderName } from "../shared/providers.ts";

// ── Test Helpers ──────────────────────────────────────────────

function createTestApp(db: Database): Hono {
  const app = new Hono().basePath("/api");
  app.route("/connections", createConnectionsRouter(db));
  return app;
}

function putJson(body: unknown): RequestInit {
  return {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  };
}

// ── Crypto Setup ──────────────────────────────────────────────

let tmpDir: string;
let originalCwd: string;
let originalDataDir: string | undefined;

beforeAll(async () => {
  originalCwd = process.cwd();
  originalDataDir = process.env.PROSEUS_DATA_DIR;
  tmpDir = await mkdtemp(join(tmpdir(), "proseus-api-conn-test-"));
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

// ── Fetch Mocking ──────────────────────────────────────────────

const originalFetch = globalThis.fetch;

/** Create a mock fetch that returns a successful validation response. */
function mockFetchSuccess() {
  globalThis.fetch = mock((url: string | URL | Request) => {
    const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
    // OpenRouter returns { data: { label: "test" } } for valid keys
    if (urlStr.includes("openrouter.ai")) {
      return Promise.resolve(
        new Response(JSON.stringify({ data: { label: "test-key" } }), { status: 200 }),
      );
    }
    // All other providers return 200 OK
    return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  }) as unknown as typeof fetch;
}

/** Create a mock fetch that returns auth failure (401). */
function mockFetchAuthFailure() {
  globalThis.fetch = mock((_url: string | URL | Request) => {
    return Promise.resolve(
      new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }),
    );
  }) as unknown as typeof fetch;
}

/** Create a mock fetch that returns server error (500). */
function mockFetchServerError() {
  globalThis.fetch = mock((_url: string | URL | Request) => {
    return Promise.resolve(
      new Response(JSON.stringify({ error: "internal" }), { status: 500 }),
    );
  }) as unknown as typeof fetch;
}

/** Create a mock fetch that throws a network error. */
function mockFetchNetworkError() {
  globalThis.fetch = mock((_url: string | URL | Request) => {
    return Promise.reject(new Error("ECONNREFUSED"));
  }) as unknown as typeof fetch;
}

// ── Tests ──────────────────────────────────────────────────────

describe("Connections API routes", () => {
  let db: Database;
  let app: Hono;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db);
    app = createTestApp(db);
  });

  afterEach(() => {
    // Restore real fetch after every test
    globalThis.fetch = originalFetch;
  });

  // ── GET ────────────────────────────────────────

  describe("GET /api/connections", () => {
    test("returns empty list initially", async () => {
      const res = await app.request("/api/connections");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.connections).toEqual([]);
    });

    test("returns statuses after saving connections", async () => {
      mockFetchSuccess();

      // Save two connections
      await app.request(
        "/api/connections/openrouter",
        putJson({ api_key: "sk-or-v1-test-key-1234567890" }),
      );
      await app.request(
        "/api/connections/anthropic",
        putJson({ api_key: "sk-ant-test-key-1234567890" }),
      );

      const res = await app.request("/api/connections");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.connections).toHaveLength(2);

      // Verify shape — never includes raw keys
      for (const conn of data.connections) {
        expect(conn.provider).toBeDefined();
        expect(conn.connected).toBe(true);
        expect(conn.updated_at).toBeNumber();
        expect(conn).not.toHaveProperty("api_key");
      }

      // Both providers present
      const providers = data.connections.map((c: { provider: string }) => c.provider);
      expect(providers).toContain("openrouter");
      expect(providers).toContain("anthropic");
    });
  });

  // ── PUT ────────────────────────────────────────

  describe("PUT /api/connections/:provider", () => {
    test("saves valid key and returns { provider, connected: true }", async () => {
      mockFetchSuccess();
      const res = await app.request(
        "/api/connections/openai",
        putJson({ api_key: "sk-test-key-1234567890" }),
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.provider).toBe("openai");
      expect(data.connected).toBe(true);
    });

    test("rejects invalid provider name", async () => {
      const res = await app.request(
        "/api/connections/fakeprovider",
        putJson({ api_key: "sk-test-key-1234567890" }),
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("Invalid provider");
    });

    test("rejects missing api_key", async () => {
      const res = await app.request(
        "/api/connections/openai",
        putJson({}),
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("api_key is required");
    });

    test("rejects empty api_key", async () => {
      const res = await app.request(
        "/api/connections/openai",
        putJson({ api_key: "" }),
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("api_key is required");
    });

    test("rejects whitespace-only api_key", async () => {
      const res = await app.request(
        "/api/connections/openai",
        putJson({ api_key: "   " }),
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("api_key is required");
    });

    test("rejects api_key shorter than 10 characters", async () => {
      mockFetchSuccess();
      const res = await app.request(
        "/api/connections/openai",
        putJson({ api_key: "short" }),
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("at least 10 characters");
    });

    test("rejects non-string api_key", async () => {
      const res = await app.request(
        "/api/connections/openai",
        putJson({ api_key: 12345678901 }),
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("api_key is required");
    });

    test("rejects when provider returns 401", async () => {
      mockFetchAuthFailure();
      const res = await app.request(
        "/api/connections/anthropic",
        putJson({ api_key: "sk-ant-invalid-key-12345" }),
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("rejected this key");
    });

    test("allows key when provider returns 5xx (graceful degradation)", async () => {
      mockFetchServerError();
      const res = await app.request(
        "/api/connections/anthropic",
        putJson({ api_key: "sk-ant-valid-key-1234567890" }),
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.connected).toBe(true);
    });

    test("allows key when fetch throws network error", async () => {
      mockFetchNetworkError();
      const res = await app.request(
        "/api/connections/openai",
        putJson({ api_key: "sk-valid-key-1234567890" }),
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.connected).toBe(true);
    });

    test("upsert — updating key for same provider", async () => {
      mockFetchSuccess();

      // Save initial key
      await app.request(
        "/api/connections/openai",
        putJson({ api_key: "sk-first-key-1234567890" }),
      );

      // Update with new key
      const res = await app.request(
        "/api/connections/openai",
        putJson({ api_key: "sk-second-key-1234567890" }),
      );
      expect(res.status).toBe(200);

      // Still only one connection
      const listRes = await app.request("/api/connections");
      const listData = await listRes.json();
      expect(listData.connections).toHaveLength(1);
      expect(listData.connections[0].provider).toBe("openai");
    });
  });

  // ── Provider-Specific Validation ──────────────

  describe("Provider-specific validation", () => {
    test("OpenRouter — rejects when response has error body (not 401)", async () => {
      // OpenRouter returns 502 with { error: { message } } for invalid keys
      globalThis.fetch = mock((_url: string | URL | Request) => {
        return Promise.resolve(
          new Response(
            JSON.stringify({ error: { message: "Invalid API key", code: 401 } }),
            { status: 502 },
          ),
        );
      }) as unknown as typeof fetch;

      const res = await app.request(
        "/api/connections/openrouter",
        putJson({ api_key: "sk-or-v1-bad-key-1234" }),
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("Invalid API key");
    });

    test("OpenRouter — accepts when response has data.label", async () => {
      globalThis.fetch = mock((_url: string | URL | Request) => {
        return Promise.resolve(
          new Response(JSON.stringify({ data: { label: "My Key" } }), { status: 200 }),
        );
      }) as unknown as typeof fetch;

      const res = await app.request(
        "/api/connections/openrouter",
        putJson({ api_key: "sk-or-v1-good-key-1234" }),
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.connected).toBe(true);
    });

    test("Gemini — rejects on 400 status", async () => {
      globalThis.fetch = mock((_url: string | URL | Request) => {
        return Promise.resolve(
          new Response(JSON.stringify({ error: { message: "bad key" } }), { status: 400 }),
        );
      }) as unknown as typeof fetch;

      const res = await app.request(
        "/api/connections/gemini",
        putJson({ api_key: "AIzaBADKEY1234567890" }),
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("Gemini");
    });

    test("Gemini — rejects on 403 status", async () => {
      globalThis.fetch = mock((_url: string | URL | Request) => {
        return Promise.resolve(
          new Response(JSON.stringify({ error: { message: "forbidden" } }), { status: 403 }),
        );
      }) as unknown as typeof fetch;

      const res = await app.request(
        "/api/connections/gemini",
        putJson({ api_key: "AIzaFORBIDDEN12345678" }),
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("Gemini");
    });

    test("xAI — rejects on 400 with 'Incorrect API key' error", async () => {
      globalThis.fetch = mock((_url: string | URL | Request) => {
        return Promise.resolve(
          new Response(
            JSON.stringify({ error: "Incorrect API key provided" }),
            { status: 400 },
          ),
        );
      }) as unknown as typeof fetch;

      const res = await app.request(
        "/api/connections/xai",
        putJson({ api_key: "xai-bad-key-1234567890" }),
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("xAI");
    });

    test("xAI — rejects on 400 without specific error message", async () => {
      globalThis.fetch = mock((_url: string | URL | Request) => {
        return Promise.resolve(
          new Response(JSON.stringify({ error: "something else" }), { status: 400 }),
        );
      }) as unknown as typeof fetch;

      const res = await app.request(
        "/api/connections/xai",
        putJson({ api_key: "xai-other-error-12345" }),
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("xAI");
    });

    test("xAI — accepts on 200", async () => {
      mockFetchSuccess();
      const res = await app.request(
        "/api/connections/xai",
        putJson({ api_key: "xai-valid-key-1234567890" }),
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.connected).toBe(true);
    });
  });

  // ── DELETE ─────────────────────────────────────

  describe("DELETE /api/connections/:provider", () => {
    test("removes an existing connection", async () => {
      mockFetchSuccess();

      // Create first
      await app.request(
        "/api/connections/openai",
        putJson({ api_key: "sk-test-key-1234567890" }),
      );

      // Delete
      const res = await app.request("/api/connections/openai", { method: "DELETE" });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);

      // Verify gone
      const listRes = await app.request("/api/connections");
      const listData = await listRes.json();
      expect(listData.connections).toHaveLength(0);
    });

    test("returns ok even if connection doesn't exist", async () => {
      const res = await app.request("/api/connections/anthropic", { method: "DELETE" });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
    });

    test("rejects invalid provider name", async () => {
      const res = await app.request("/api/connections/notreal", { method: "DELETE" });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("Invalid provider");
    });
  });

  // ── Property-Based ─────────────────────────────

  describe("Property-based tests", () => {
    test("any valid provider + key >= 10 chars succeeds when fetch returns OK", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...PROVIDER_IDS),
          fc.string({ minLength: 10, maxLength: 200 }).filter((s) => s.trim().length >= 10),
          async (provider, key) => {
            // Fresh DB and app per iteration
            const iterDb = new Database(":memory:");
            runMigrations(iterDb);
            const iterApp = createTestApp(iterDb);

            // Mock success for this iteration
            globalThis.fetch = mock((_url: string | URL | Request) => {
              const urlStr =
                typeof _url === "string" ? _url : _url instanceof URL ? _url.toString() : _url.url;
              if (urlStr.includes("openrouter.ai")) {
                return Promise.resolve(
                  new Response(JSON.stringify({ data: { label: "k" } }), { status: 200 }),
                );
              }
              return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
            }) as unknown as typeof fetch;

            const res = await iterApp.request(
              `/api/connections/${provider}`,
              putJson({ api_key: key }),
            );
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.connected).toBe(true);
          },
        ),
        { numRuns: 25 },
      );
    });

    test("invalid providers always rejected regardless of key", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.stringMatching(/^[a-z]{3,20}$/).filter(
            (s) => !(PROVIDER_IDS as readonly string[]).includes(s),
          ),
          fc.string({ minLength: 10, maxLength: 200 }),
          async (provider, key) => {
            const res = await app.request(
              `/api/connections/${provider}`,
              putJson({ api_key: key }),
            );
            expect(res.status).toBe(400);
            const data = await res.json();
            expect(data.error).toContain("Invalid provider");
          },
        ),
        { numRuns: 25 },
      );
    });
  });
});
