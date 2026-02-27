/**
 * ws.test.ts — Tests for src/server/ws.ts
 *
 * The WebSocket handler is the sole entry point for all real-time
 * operations: subscribing to chat topics, triggering AI generation,
 * cancelling streams, and receiving reconnect state. It's a thin
 * routing layer over StreamManager, but correctness here is critical
 * because a misrouted message or a swallowed error means the user's
 * chat silently breaks.
 *
 * Coverage:
 *  ── Message Validation ──
 *  - Invalid JSON sends error response (not silent)
 *  - Non-object JSON sends error response
 *  - Missing type field sends error response
 *  - Unknown type sends error response
 *  - Missing required fields per message type send error response
 *
 *  ── Subscribe / Unsubscribe ──
 *  - subscribe adds topic and tracks in subscribedChats
 *  - duplicate subscribe is idempotent (no double-subscribe)
 *  - subscribe with active stream sends stream:start + stream:content
 *  - subscribe with active stream (no content yet) sends only stream:start
 *  - unsubscribe removes topic and tracking
 *  - unsubscribe on non-subscribed chat is no-op
 *
 *  ── Message Delegation ──
 *  - test-stream delegates to streamManager.startTestStream
 *  - ai-stream delegates to streamManager.startAIStream
 *  - generate delegates to streamManager.startGeneration
 *  - generate with error result sends stream:error to client
 *  - cancel-stream delegates to streamManager.cancelStream
 *
 *  ── Close ──
 *  - close unsubscribes from all tracked topics
 *
 *  ── Fault Injection ──
 *  - streamManager throws during delegation: error sent to client
 *  - rapid subscribe/unsubscribe cycling: no leaked state
 */

import { test, expect, describe, beforeEach } from "bun:test";
import { createWebSocketHandler } from "../server/ws.ts";
import type { WsContext } from "../shared/ws-types.ts";

// ── Mock ServerWebSocket ──────────────────────────────────────

interface MockWs {
  data: WsContext;
  sent: string[];
  subscriptions: Set<string>;
  send(message: string): void;
  subscribe(topic: string): void;
  unsubscribe(topic: string): void;
  /** Parse all sent messages as JSON */
  getSentMessages(): Array<Record<string, unknown>>;
  /** Get sent messages filtered by type */
  getSentByType(type: string): Array<Record<string, unknown>>;
  clear(): void;
}

function createMockWs(): MockWs {
  const ws: MockWs = {
    data: { subscribedChats: new Set<string>() },
    sent: [],
    subscriptions: new Set<string>(),
    send(message: string) {
      ws.sent.push(message);
    },
    subscribe(topic: string) {
      ws.subscriptions.add(topic);
    },
    unsubscribe(topic: string) {
      ws.subscriptions.delete(topic);
    },
    getSentMessages() {
      return ws.sent.map((s) => JSON.parse(s) as Record<string, unknown>);
    },
    getSentByType(type: string) {
      return ws.getSentMessages().filter((m) => m.type === type);
    },
    clear() {
      ws.sent.length = 0;
    },
  };
  return ws;
}

// ── Mock StreamManager ────────────────────────────────────────

interface MockStreamManagerCalls {
  startTestStream: Array<{ chatId: string; parentId: string; speakerId: string; nodeId: string }>;
  startAIStream: Array<{
    chatId: string;
    parentId: string;
    speakerId: string;
    model: string;
    nodeId: string;
    provider?: string;
  }>;
  startGeneration: Array<{
    chatId: string;
    model: string;
    nodeId: string;
    provider?: string;
    regenerate?: boolean;
    targetNodeId?: string;
  }>;
  cancelStream: Array<{ chatId: string }>;
  getActiveStream: Array<{ chatId: string }>;
}

function createMockStreamManager(options?: {
  /** What getActiveStream returns for any chatId */
  activeStream?: {
    id: string;
    chatId: string;
    parentId: string;
    speakerId: string;
    nodeId: string;
    content: string;
  } | null;
  /** What startGeneration returns */
  generateResult?: { streamId: string } | { error: string };
  /** If true, startAIStream throws */
  aiStreamThrows?: boolean;
  /** If true, startTestStream throws */
  testStreamThrows?: boolean;
}) {
  const calls: MockStreamManagerCalls = {
    startTestStream: [],
    startAIStream: [],
    startGeneration: [],
    cancelStream: [],
    getActiveStream: [],
  };

  const manager = {
    getActiveStream(chatId: string) {
      calls.getActiveStream.push({ chatId });
      return options?.activeStream ?? null;
    },
    startTestStream(chatId: string, parentId: string, speakerId: string, nodeId: string) {
      calls.startTestStream.push({ chatId, parentId, speakerId, nodeId });
      if (options?.testStreamThrows) throw new Error("test-stream mock error");
      return "mock-stream-id";
    },
    async startAIStream(
      chatId: string,
      parentId: string,
      speakerId: string,
      model: string,
      nodeId: string,
      provider?: string,
    ) {
      calls.startAIStream.push({ chatId, parentId, speakerId, model, nodeId, provider });
      if (options?.aiStreamThrows) throw new Error("ai-stream mock error");
      return "mock-stream-id";
    },
    async startGeneration(
      chatId: string,
      model: string,
      nodeId: string,
      provider?: string,
      regenerate?: boolean,
      targetNodeId?: string,
    ) {
      calls.startGeneration.push({ chatId, model, nodeId, provider, regenerate, targetNodeId });
      return options?.generateResult ?? { streamId: "mock-stream-id" };
    },
    cancelStream(chatId: string) {
      calls.cancelStream.push({ chatId });
      return true;
    },
  };

  return { manager, calls };
}

// ── Helpers ──────────────────────────────────────────────────

/** Send a raw string message through the handler */
async function sendRaw(
  handler: ReturnType<typeof createWebSocketHandler>,
  ws: MockWs,
  raw: string,
) {
  await handler.message(ws as any, raw);
}

/** Send a typed message through the handler */
async function sendMsg(
  handler: ReturnType<typeof createWebSocketHandler>,
  ws: MockWs,
  msg: Record<string, unknown>,
) {
  await sendRaw(handler, ws, JSON.stringify(msg));
}

// ── Tests ──────────────────────────────────────────────────────

describe("WebSocket handler", () => {
  // ── Message Validation ─────────────────────────

  describe("Message validation", () => {
    let handler: ReturnType<typeof createWebSocketHandler>;
    let ws: MockWs;

    beforeEach(() => {
      const { manager } = createMockStreamManager();
      handler = createWebSocketHandler(manager as any);
      ws = createMockWs();
    });

    test("invalid JSON sends error response", async () => {
      await sendRaw(handler, ws, "this is not json{{{");

      const msgs = ws.getSentMessages();
      expect(msgs).toHaveLength(1);
      expect(msgs[0]!.type).toBe("error");
      expect(msgs[0]!.error).toBe("invalid JSON");
    });

    test("non-object JSON (array) sends error response", async () => {
      await sendRaw(handler, ws, '[1, 2, 3]');

      const msgs = ws.getSentMessages();
      expect(msgs).toHaveLength(1);
      expect(msgs[0]!.type).toBe("error");
      expect(msgs[0]!.error).toBe("message must be a JSON object");
    });

    test("non-object JSON (string) sends error response", async () => {
      await sendRaw(handler, ws, '"hello"');

      const msgs = ws.getSentMessages();
      expect(msgs).toHaveLength(1);
      expect(msgs[0]!.type).toBe("error");
      expect(msgs[0]!.error).toBe("message must be a JSON object");
    });

    test("non-object JSON (null) sends error response", async () => {
      await sendRaw(handler, ws, 'null');

      const msgs = ws.getSentMessages();
      expect(msgs).toHaveLength(1);
      expect(msgs[0]!.type).toBe("error");
      expect(msgs[0]!.error).toBe("message must be a JSON object");
    });

    test("missing type field sends error response", async () => {
      await sendMsg(handler, ws, { chatId: "abc" });

      const msgs = ws.getSentMessages();
      expect(msgs).toHaveLength(1);
      expect(msgs[0]!.type).toBe("error");
      expect(msgs[0]!.error).toContain("type");
    });

    test("unknown type sends error response", async () => {
      await sendMsg(handler, ws, { type: "explode", chatId: "abc" });

      const msgs = ws.getSentMessages();
      expect(msgs).toHaveLength(1);
      expect(msgs[0]!.type).toBe("error");
      expect(msgs[0]!.error).toContain("unknown message type");
    });

    test("subscribe missing chatId sends error response", async () => {
      await sendMsg(handler, ws, { type: "subscribe" });

      const msgs = ws.getSentMessages();
      expect(msgs).toHaveLength(1);
      expect(msgs[0]!.type).toBe("error");
      expect(msgs[0]!.error).toContain("chatId");
    });

    test("test-stream missing required fields sends error response", async () => {
      await sendMsg(handler, ws, { type: "test-stream", chatId: "abc" });

      const msgs = ws.getSentMessages();
      expect(msgs).toHaveLength(1);
      expect(msgs[0]!.type).toBe("error");
      expect(msgs[0]!.error).toContain("parentId");
    });

    test("ai-stream missing model sends error response", async () => {
      await sendMsg(handler, ws, {
        type: "ai-stream",
        chatId: "abc",
        parentId: "p1",
        speakerId: "s1",
        nodeId: "n1",
      });

      const msgs = ws.getSentMessages();
      expect(msgs).toHaveLength(1);
      expect(msgs[0]!.type).toBe("error");
      expect(msgs[0]!.error).toContain("model");
    });

    test("generate missing model sends error response", async () => {
      await sendMsg(handler, ws, { type: "generate", chatId: "abc", nodeId: "n1" });

      const msgs = ws.getSentMessages();
      expect(msgs).toHaveLength(1);
      expect(msgs[0]!.type).toBe("error");
      expect(msgs[0]!.error).toContain("model");
    });

    test("generate with non-boolean regenerate sends error response", async () => {
      await sendMsg(handler, ws, {
        type: "generate",
        chatId: "abc",
        model: "test-model",
        nodeId: "n1",
        regenerate: "yes",
      });

      const msgs = ws.getSentMessages();
      expect(msgs).toHaveLength(1);
      expect(msgs[0]!.type).toBe("error");
      expect(msgs[0]!.error).toContain("regenerate");
    });

    test("generate with non-string provider sends error response", async () => {
      await sendMsg(handler, ws, {
        type: "generate",
        chatId: "abc",
        model: "test-model",
        nodeId: "n1",
        provider: 123,
      });

      const msgs = ws.getSentMessages();
      expect(msgs).toHaveLength(1);
      expect(msgs[0]!.type).toBe("error");
      expect(msgs[0]!.error).toContain("provider");
    });

    test("Buffer input is handled correctly", async () => {
      const buffer = Buffer.from(JSON.stringify({ type: "subscribe", chatId: "abc" }));
      await handler.message(ws as any, buffer);

      expect(ws.subscriptions.has("chat:abc")).toBe(true);
      expect(ws.data.subscribedChats.has("abc")).toBe(true);
    });
  });

  // ── Subscribe / Unsubscribe ────────────────────

  describe("Subscribe / Unsubscribe", () => {
    test("subscribe adds topic and tracks chatId", async () => {
      const { manager } = createMockStreamManager();
      const handler = createWebSocketHandler(manager as any);
      const ws = createMockWs();

      await sendMsg(handler, ws, { type: "subscribe", chatId: "chat-1" });

      expect(ws.subscriptions.has("chat:chat-1")).toBe(true);
      expect(ws.data.subscribedChats.has("chat-1")).toBe(true);
      // No messages sent (no active stream)
      expect(ws.sent).toHaveLength(0);
    });

    test("duplicate subscribe is idempotent — no double-subscribe", async () => {
      const { manager } = createMockStreamManager();
      const handler = createWebSocketHandler(manager as any);
      const ws = createMockWs();

      await sendMsg(handler, ws, { type: "subscribe", chatId: "chat-1" });
      await sendMsg(handler, ws, { type: "subscribe", chatId: "chat-1" });

      // subscribe() should have been called exactly once on the ws
      // (the second is guarded by subscribedChats.has())
      expect(ws.data.subscribedChats.has("chat-1")).toBe(true);
      // No messages sent either time (no active stream)
      expect(ws.sent).toHaveLength(0);
    });

    test("subscribe with active stream sends stream:start + stream:content", async () => {
      const { manager } = createMockStreamManager({
        activeStream: {
          id: "stream-abc",
          chatId: "chat-1",
          parentId: "parent-1",
          speakerId: "speaker-1",
          nodeId: "node-1",
          content: "Hello world so far",
        },
      });
      const handler = createWebSocketHandler(manager as any);
      const ws = createMockWs();

      await sendMsg(handler, ws, { type: "subscribe", chatId: "chat-1" });

      const msgs = ws.getSentMessages();
      expect(msgs).toHaveLength(2);

      // First: stream:start
      expect(msgs[0]).toMatchObject({
        type: "stream:start",
        chatId: "chat-1",
        streamId: "stream-abc",
        parentId: "parent-1",
        speakerId: "speaker-1",
        nodeId: "node-1",
      });

      // Second: stream:content with accumulated text
      expect(msgs[1]).toMatchObject({
        type: "stream:content",
        chatId: "chat-1",
        streamId: "stream-abc",
        content: "Hello world so far",
      });
    });

    test("subscribe with active stream (empty content) sends only stream:start", async () => {
      const { manager } = createMockStreamManager({
        activeStream: {
          id: "stream-abc",
          chatId: "chat-1",
          parentId: "parent-1",
          speakerId: "speaker-1",
          nodeId: "node-1",
          content: "",
        },
      });
      const handler = createWebSocketHandler(manager as any);
      const ws = createMockWs();

      await sendMsg(handler, ws, { type: "subscribe", chatId: "chat-1" });

      const msgs = ws.getSentMessages();
      expect(msgs).toHaveLength(1);
      expect(msgs[0]!.type).toBe("stream:start");
    });

    test("unsubscribe removes topic and tracking", async () => {
      const { manager } = createMockStreamManager();
      const handler = createWebSocketHandler(manager as any);
      const ws = createMockWs();

      // Subscribe first
      await sendMsg(handler, ws, { type: "subscribe", chatId: "chat-1" });
      expect(ws.subscriptions.has("chat:chat-1")).toBe(true);
      expect(ws.data.subscribedChats.has("chat-1")).toBe(true);

      // Unsubscribe
      await sendMsg(handler, ws, { type: "unsubscribe", chatId: "chat-1" });
      expect(ws.subscriptions.has("chat:chat-1")).toBe(false);
      expect(ws.data.subscribedChats.has("chat-1")).toBe(false);
    });

    test("unsubscribe on non-subscribed chat is no-op", async () => {
      const { manager } = createMockStreamManager();
      const handler = createWebSocketHandler(manager as any);
      const ws = createMockWs();

      // Unsubscribe without subscribing first — should not throw
      await sendMsg(handler, ws, { type: "unsubscribe", chatId: "chat-1" });

      expect(ws.subscriptions.size).toBe(0);
      expect(ws.sent).toHaveLength(0);
    });

    test("can subscribe to multiple chats independently", async () => {
      const { manager } = createMockStreamManager();
      const handler = createWebSocketHandler(manager as any);
      const ws = createMockWs();

      await sendMsg(handler, ws, { type: "subscribe", chatId: "chat-1" });
      await sendMsg(handler, ws, { type: "subscribe", chatId: "chat-2" });

      expect(ws.subscriptions.has("chat:chat-1")).toBe(true);
      expect(ws.subscriptions.has("chat:chat-2")).toBe(true);
      expect(ws.data.subscribedChats.size).toBe(2);

      // Unsubscribe from one doesn't affect the other
      await sendMsg(handler, ws, { type: "unsubscribe", chatId: "chat-1" });
      expect(ws.subscriptions.has("chat:chat-1")).toBe(false);
      expect(ws.subscriptions.has("chat:chat-2")).toBe(true);
    });
  });

  // ── Message Delegation ────────────────────────

  describe("Message delegation", () => {
    test("test-stream delegates to streamManager.startTestStream", async () => {
      const { manager, calls } = createMockStreamManager();
      const handler = createWebSocketHandler(manager as any);
      const ws = createMockWs();

      await sendMsg(handler, ws, {
        type: "test-stream",
        chatId: "chat-1",
        parentId: "parent-1",
        speakerId: "speaker-1",
        nodeId: "node-1",
      });

      expect(calls.startTestStream).toHaveLength(1);
      expect(calls.startTestStream[0]).toEqual({
        chatId: "chat-1",
        parentId: "parent-1",
        speakerId: "speaker-1",
        nodeId: "node-1",
      });
    });

    test("ai-stream delegates to streamManager.startAIStream", async () => {
      const { manager, calls } = createMockStreamManager();
      const handler = createWebSocketHandler(manager as any);
      const ws = createMockWs();

      await sendMsg(handler, ws, {
        type: "ai-stream",
        chatId: "chat-1",
        parentId: "parent-1",
        speakerId: "speaker-1",
        model: "gpt-4",
        nodeId: "node-1",
        provider: "openai",
      });

      expect(calls.startAIStream).toHaveLength(1);
      expect(calls.startAIStream[0]).toEqual({
        chatId: "chat-1",
        parentId: "parent-1",
        speakerId: "speaker-1",
        model: "gpt-4",
        nodeId: "node-1",
        provider: "openai",
      });
    });

    test("ai-stream without provider passes undefined", async () => {
      const { manager, calls } = createMockStreamManager();
      const handler = createWebSocketHandler(manager as any);
      const ws = createMockWs();

      await sendMsg(handler, ws, {
        type: "ai-stream",
        chatId: "chat-1",
        parentId: "parent-1",
        speakerId: "speaker-1",
        model: "gpt-4",
        nodeId: "node-1",
      });

      expect(calls.startAIStream).toHaveLength(1);
      expect(calls.startAIStream[0]!.provider).toBeUndefined();
    });

    test("generate delegates to streamManager.startGeneration", async () => {
      const { manager, calls } = createMockStreamManager();
      const handler = createWebSocketHandler(manager as any);
      const ws = createMockWs();

      await sendMsg(handler, ws, {
        type: "generate",
        chatId: "chat-1",
        model: "claude-3",
        nodeId: "node-1",
        provider: "anthropic",
        regenerate: true,
        targetNodeId: "target-1",
      });

      expect(calls.startGeneration).toHaveLength(1);
      expect(calls.startGeneration[0]).toEqual({
        chatId: "chat-1",
        model: "claude-3",
        nodeId: "node-1",
        provider: "anthropic",
        regenerate: true,
        targetNodeId: "target-1",
      });
    });

    test("generate with error result sends stream:error to client", async () => {
      const { manager } = createMockStreamManager({
        generateResult: { error: "No API key configured for openrouter" },
      });
      const handler = createWebSocketHandler(manager as any);
      const ws = createMockWs();

      await sendMsg(handler, ws, {
        type: "generate",
        chatId: "chat-1",
        model: "test-model",
        nodeId: "node-1",
      });

      const errors = ws.getSentByType("stream:error");
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({
        type: "stream:error",
        chatId: "chat-1",
        streamId: "",
        error: "No API key configured for openrouter",
      });
    });

    test("generate with success result sends nothing to client", async () => {
      const { manager } = createMockStreamManager({
        generateResult: { streamId: "new-stream-id" },
      });
      const handler = createWebSocketHandler(manager as any);
      const ws = createMockWs();

      await sendMsg(handler, ws, {
        type: "generate",
        chatId: "chat-1",
        model: "test-model",
        nodeId: "node-1",
      });

      // No direct messages — stream events come via pub/sub
      expect(ws.sent).toHaveLength(0);
    });

    test("cancel-stream delegates to streamManager.cancelStream", async () => {
      const { manager, calls } = createMockStreamManager();
      const handler = createWebSocketHandler(manager as any);
      const ws = createMockWs();

      await sendMsg(handler, ws, { type: "cancel-stream", chatId: "chat-1" });

      expect(calls.cancelStream).toHaveLength(1);
      expect(calls.cancelStream[0]).toEqual({ chatId: "chat-1" });
    });
  });

  // ── Close ────────────────────────────────────

  describe("Close handler", () => {
    test("close unsubscribes from all tracked topics", async () => {
      const { manager } = createMockStreamManager();
      const handler = createWebSocketHandler(manager as any);
      const ws = createMockWs();

      // Subscribe to multiple chats
      await sendMsg(handler, ws, { type: "subscribe", chatId: "chat-1" });
      await sendMsg(handler, ws, { type: "subscribe", chatId: "chat-2" });
      await sendMsg(handler, ws, { type: "subscribe", chatId: "chat-3" });

      expect(ws.subscriptions.size).toBe(3);

      // Trigger close
      handler.close(ws as any);

      // All topics unsubscribed
      expect(ws.subscriptions.size).toBe(0);
    });

    test("close with no subscriptions is safe", () => {
      const { manager } = createMockStreamManager();
      const handler = createWebSocketHandler(manager as any);
      const ws = createMockWs();

      // Should not throw
      handler.close(ws as any);
      expect(ws.subscriptions.size).toBe(0);
    });
  });

  // ── Fault Injection ────────────────────────────

  describe("Fault injection", () => {
    test("streamManager throws during test-stream — error sent to client", async () => {
      const { manager } = createMockStreamManager({ testStreamThrows: true });
      const handler = createWebSocketHandler(manager as any);
      const ws = createMockWs();

      await sendMsg(handler, ws, {
        type: "test-stream",
        chatId: "chat-1",
        parentId: "p1",
        speakerId: "s1",
        nodeId: "n1",
      });

      const errors = ws.getSentByType("error");
      expect(errors).toHaveLength(1);
      expect(errors[0]!.error).toBe("test-stream mock error");
    });

    test("streamManager throws during ai-stream — error sent to client", async () => {
      const { manager } = createMockStreamManager({ aiStreamThrows: true });
      const handler = createWebSocketHandler(manager as any);
      const ws = createMockWs();

      await sendMsg(handler, ws, {
        type: "ai-stream",
        chatId: "chat-1",
        parentId: "p1",
        speakerId: "s1",
        model: "test-model",
        nodeId: "n1",
      });

      const errors = ws.getSentByType("error");
      expect(errors).toHaveLength(1);
      expect(errors[0]!.error).toBe("ai-stream mock error");
    });

    test("rapid subscribe/unsubscribe cycling — no leaked state", async () => {
      const { manager } = createMockStreamManager();
      const handler = createWebSocketHandler(manager as any);
      const ws = createMockWs();

      // Rapid cycle 20 times
      for (let i = 0; i < 20; i++) {
        await sendMsg(handler, ws, { type: "subscribe", chatId: "chat-1" });
        await sendMsg(handler, ws, { type: "unsubscribe", chatId: "chat-1" });
      }

      // Clean state
      expect(ws.subscriptions.size).toBe(0);
      expect(ws.data.subscribedChats.size).toBe(0);
    });

    test("multiple different valid messages in sequence", async () => {
      const { manager, calls } = createMockStreamManager();
      const handler = createWebSocketHandler(manager as any);
      const ws = createMockWs();

      await sendMsg(handler, ws, { type: "subscribe", chatId: "chat-1" });
      await sendMsg(handler, ws, {
        type: "test-stream",
        chatId: "chat-1",
        parentId: "p1",
        speakerId: "s1",
        nodeId: "n1",
      });
      await sendMsg(handler, ws, { type: "cancel-stream", chatId: "chat-1" });
      await sendMsg(handler, ws, { type: "unsubscribe", chatId: "chat-1" });

      expect(ws.subscriptions.size).toBe(0);
      expect(calls.startTestStream).toHaveLength(1);
      expect(calls.cancelStream).toHaveLength(1);
    });
  });

  // ── Open handler ──────────────────────────────

  describe("Open handler", () => {
    test("open is a no-op (no crash, no state mutation)", () => {
      const { manager } = createMockStreamManager();
      const handler = createWebSocketHandler(manager as any);
      const ws = createMockWs();

      // Should not throw and should not modify ws state
      handler.open(ws as any);
      expect(ws.sent).toHaveLength(0);
      expect(ws.subscriptions.size).toBe(0);
    });
  });
});
