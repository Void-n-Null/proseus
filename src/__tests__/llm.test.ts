/**
 * llm.test.ts — Tests for src/server/lib/llm.ts
 *
 * LLM provider factory that creates AI SDK model instances. Tests cover:
 *
 *  - createModel: all 5 provider branches (openrouter, anthropic, openai, gemini, xai)
 *  - createModel: correct arguments passed to each SDK constructor
 *  - createModel: OpenRouter sends Proseus referer headers
 *  - createModel: throws descriptive error when no API key
 *  - createModel: throws for unknown provider
 *  - hasApiKey: returns boolean based on DB state
 */

import { test, expect, describe, mock, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { runMigrations } from "../server/db/schema.ts";
import {
  ensureEncryptionKey,
  encrypt,
} from "../server/lib/crypto.ts";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProviderName } from "../shared/providers.ts";

// ── Mock SDK constructors ────────────────────────────────────
// Each provider's create* function returns an object with .chat() or is callable.
// We mock them to capture arguments and return a fake LanguageModel.

const fakeModel = { modelId: "fake-model", provider: "fake" } as any;

const mockOpenRouterChat = mock(() => fakeModel);
const mockCreateOpenRouter = mock(() => ({ chat: mockOpenRouterChat }));

const mockAnthropicCallable = mock(() => fakeModel);
const mockCreateAnthropic = mock(() => mockAnthropicCallable);

const mockOpenAIChat = mock(() => fakeModel);
const mockCreateOpenAI = mock(() => ({ chat: mockOpenAIChat }));

const mockGoogleCallable = mock(() => fakeModel);
const mockCreateGoogle = mock(() => mockGoogleCallable);

const mockXaiCallable = mock(() => fakeModel);
const mockCreateXai = mock(() => mockXaiCallable);

// Apply module mocks before importing llm.ts
mock.module("@openrouter/ai-sdk-provider", () => ({
  createOpenRouter: mockCreateOpenRouter,
}));

mock.module("@ai-sdk/anthropic", () => ({
  createAnthropic: mockCreateAnthropic,
}));

mock.module("@ai-sdk/openai", () => ({
  createOpenAI: mockCreateOpenAI,
}));

mock.module("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: mockCreateGoogle,
}));

mock.module("@ai-sdk/xai", () => ({
  createXai: mockCreateXai,
}));

// Now import the module under test (will use mocked SDK constructors)
const { createModel, hasApiKey } = await import("../server/lib/llm.ts");

// ── Test Setup ───────────────────────────────────────────────

let db: Database;
let tmpDir: string;
let originalCwd: string;

// We need crypto initialized for encrypt() used by seedConnection
beforeEach(async () => {
  // Reset all mock call counts
  mockCreateOpenRouter.mockClear();
  mockOpenRouterChat.mockClear();
  mockCreateAnthropic.mockClear();
  mockAnthropicCallable.mockClear();
  mockCreateOpenAI.mockClear();
  mockOpenAIChat.mockClear();
  mockCreateGoogle.mockClear();
  mockGoogleCallable.mockClear();
  mockCreateXai.mockClear();
  mockXaiCallable.mockClear();

  // Fresh in-memory DB for each test
  db = new Database(":memory:");
  runMigrations(db);
});

// One-time setup: crypto key for encrypt()
originalCwd = process.cwd();
tmpDir = await mkdtemp(join(tmpdir(), "proseus-llm-test-"));
process.chdir(tmpDir);
await ensureEncryptionKey();

// Helper: seed a connection with an encrypted key
async function seedConnection(provider: string, key: string) {
  const encKey = await encrypt(key);
  const now = Date.now();
  db.run(
    "INSERT INTO connections (provider, api_key, created_at, updated_at) VALUES (?, ?, ?, ?)",
    [provider, encKey, now, now],
  );
}

// ============================================================
// createModel — Provider Branches
// ============================================================

describe("createModel", () => {
  test("openrouter: creates provider with apiKey + Proseus headers", async () => {
    await seedConnection("openrouter", "sk-or-v1-test-key");

    const model = await createModel(db, "openrouter", "anthropic/claude-sonnet-4");

    // Verify createOpenRouter was called with the correct arguments
    expect(mockCreateOpenRouter).toHaveBeenCalledTimes(1);
    const callArgs = mockCreateOpenRouter.mock.calls[0] as unknown[];
    const args = callArgs[0] as Record<string, unknown>;
    expect(args.apiKey).toBe("sk-or-v1-test-key");
    expect(args.headers).toEqual({
      "HTTP-Referer": "https://proseus.dev",
      "X-Title": "Proseus",
    });

    // Verify .chat() was called with the model ID
    expect(mockOpenRouterChat).toHaveBeenCalledWith("anthropic/claude-sonnet-4");
    expect(model).toBe(fakeModel);
  });

  test("anthropic: creates provider with apiKey, called with modelId", async () => {
    await seedConnection("anthropic", "sk-ant-test-key");

    const model = await createModel(db, "anthropic", "claude-sonnet-4-20250514");

    expect(mockCreateAnthropic).toHaveBeenCalledTimes(1);
    const callArgs = mockCreateAnthropic.mock.calls[0] as unknown[];
    const args = callArgs[0] as Record<string, unknown>;
    expect(args.apiKey).toBe("sk-ant-test-key");

    // Anthropic provider is callable directly (not .chat())
    expect(mockAnthropicCallable).toHaveBeenCalledWith("claude-sonnet-4-20250514");
    expect(model).toBe(fakeModel);
  });

  test("openai: creates provider with apiKey, uses .chat()", async () => {
    await seedConnection("openai", "sk-openai-test-key");

    const model = await createModel(db, "openai", "gpt-4o");

    expect(mockCreateOpenAI).toHaveBeenCalledTimes(1);
    const callArgs = mockCreateOpenAI.mock.calls[0] as unknown[];
    const args = callArgs[0] as Record<string, unknown>;
    expect(args.apiKey).toBe("sk-openai-test-key");

    expect(mockOpenAIChat).toHaveBeenCalledWith("gpt-4o");
    expect(model).toBe(fakeModel);
  });

  test("gemini: creates Google provider with apiKey, called with modelId", async () => {
    await seedConnection("gemini", "AIzaSyD-test-key");

    const model = await createModel(db, "gemini", "gemini-2.0-flash");

    expect(mockCreateGoogle).toHaveBeenCalledTimes(1);
    const callArgs = mockCreateGoogle.mock.calls[0] as unknown[];
    const args = callArgs[0] as Record<string, unknown>;
    expect(args.apiKey).toBe("AIzaSyD-test-key");

    expect(mockGoogleCallable).toHaveBeenCalledWith("gemini-2.0-flash");
    expect(model).toBe(fakeModel);
  });

  test("xai: creates provider with apiKey, called with modelId", async () => {
    await seedConnection("xai", "xai-test-key");

    const model = await createModel(db, "xai", "grok-3");

    expect(mockCreateXai).toHaveBeenCalledTimes(1);
    const callArgs = mockCreateXai.mock.calls[0] as unknown[];
    const args = callArgs[0] as Record<string, unknown>;
    expect(args.apiKey).toBe("xai-test-key");

    expect(mockXaiCallable).toHaveBeenCalledWith("grok-3");
    expect(model).toBe(fakeModel);
  });
});

// ============================================================
// createModel — Error Cases
// ============================================================

describe("createModel — errors", () => {
  test("throws when no API key is configured for provider", async () => {
    // No connections seeded — DB is empty
    expect(createModel(db, "anthropic", "claude-sonnet-4")).rejects.toThrow(
      "Anthropic not connected",
    );
  });

  test("throws with provider label in error message", async () => {
    expect(createModel(db, "openrouter", "some-model")).rejects.toThrow("OpenRouter");
    expect(createModel(db, "openai", "gpt-4o")).rejects.toThrow("OpenAI");
    expect(createModel(db, "gemini", "gemini-flash")).rejects.toThrow("Gemini");
    expect(createModel(db, "xai", "grok")).rejects.toThrow("X-AI");
  });

  test("throws for unknown provider", async () => {
    expect(
      createModel(db, "nonexistent" as ProviderName, "model-id"),
    ).rejects.toThrow();
  });

  test("error message mentions Connections page", async () => {
    expect(createModel(db, "anthropic", "claude")).rejects.toThrow(
      "Add your API key in Connections",
    );
  });
});

// ============================================================
// hasApiKey
// ============================================================

describe("hasApiKey", () => {
  test("returns false when no key is stored", async () => {
    const result = await hasApiKey(db, "anthropic");
    expect(result).toBe(false);
  });

  test("returns true when key is stored", async () => {
    await seedConnection("anthropic", "sk-ant-test");
    const result = await hasApiKey(db, "anthropic");
    expect(result).toBe(true);
  });

  test("returns false for different provider than stored", async () => {
    await seedConnection("openai", "sk-openai-test");
    expect(await hasApiKey(db, "anthropic")).toBe(false);
    expect(await hasApiKey(db, "openai")).toBe(true);
  });

  test("returns true for each provider independently", async () => {
    await seedConnection("openrouter", "sk-or-v1-test");
    await seedConnection("anthropic", "sk-ant-test");
    await seedConnection("openai", "sk-openai-test");
    await seedConnection("gemini", "AIzaSyD-test");
    await seedConnection("xai", "xai-test");

    expect(await hasApiKey(db, "openrouter")).toBe(true);
    expect(await hasApiKey(db, "anthropic")).toBe(true);
    expect(await hasApiKey(db, "openai")).toBe(true);
    expect(await hasApiKey(db, "gemini")).toBe(true);
    expect(await hasApiKey(db, "xai")).toBe(true);
  });
});

// Cleanup
process.on("exit", () => {
  try {
    process.chdir(originalCwd);
  } catch {
    // ignore
  }
});
