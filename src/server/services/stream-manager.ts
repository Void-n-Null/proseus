/**
 * Server-side stream manager.
 *
 * Owns the lifecycle of all active AI streams. Streams accumulate
 * content in memory and persist to SQLite on finalization. All
 * connected clients are notified via Bun's pub/sub WebSocket topics.
 *
 * The client never owns stream state — it subscribes and displays.
 * If the client refreshes mid-stream, it reconnects, re-subscribes,
 * and receives the full accumulated content immediately.
 */

import type { Server } from "bun";
import type { Database } from "bun:sqlite";
import { streamText } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { ServerWsMessage, WsContext } from "../../shared/ws-types.ts";
import type { ChatNode } from "../../shared/types.ts";
import { generateId, generateClientId } from "../../shared/ids.ts";
import { getActivePath } from "../../shared/tree.ts";
import { addMessage, getChatTree } from "../db/messages.ts";
import { getChat } from "../db/chats.ts";

// ── Types ──────────────────────────────────────────────────────

interface ActiveStream {
  id: string;
  chatId: string;
  parentId: string;
  speakerId: string;
  nodeClientId: string;
  content: string;
  startedAt: number;
  abortController?: AbortController;
}

// ── Test content ───────────────────────────────────────────────

const TEST_RESPONSE =
  "This is a test response from the Proseus streaming engine. " +
  "The server is generating this text word by word to demonstrate " +
  "server-side streaming persistence. Each chunk is broadcast via " +
  "WebSocket to all connected clients. When this stream completes, " +
  "the full message will be persisted to the SQLite database as a " +
  "permanent chat node. You can refresh the page at any time during " +
  "streaming and reconnect to see the current state. This is the " +
  "architecture that makes Proseus reliable — streams live on the " +
  "server, not the client.";

// ── Stream Manager ─────────────────────────────────────────────

export class StreamManager {
  private activeStreams = new Map<string, ActiveStream>();
  private chatStreams = new Map<string, string>(); // chatId -> streamId
  private streamTimers = new Map<string, Timer>();
  private server: Server<WsContext> | null = null;
  private db: Database;
  private apiKey: string | null = null;

  constructor(db: Database) {
    this.db = db;
  }

  /** Must be called after Bun.serve() to enable pub/sub broadcasting. */
  setServer(server: Server<WsContext>): void {
    this.server = server;
  }

  /** Store an OpenRouter API key for use in AI streams. */
  setApiKey(key: string): void {
    this.apiKey = key;
  }

  /** Check if an API key has been configured. */
  hasApiKey(): boolean {
    return this.apiKey !== null && this.apiKey.length > 0;
  }

  /** Get the active stream for a chat, if any. */
  getActiveStream(chatId: string): ActiveStream | null {
    const streamId = this.chatStreams.get(chatId);
    if (!streamId) return null;
    return this.activeStreams.get(streamId) ?? null;
  }

  // ── Test stream ────────────────────────────────────────────

  /**
   * Start a test stream that simulates AI token generation.
   * Streams the test content word-by-word at ~80ms intervals.
   */
  startTestStream(
    chatId: string,
    parentId: string,
    speakerId: string,
  ): string | null {
    if (this.chatStreams.has(chatId)) return null;

    const streamId = generateId();
    const nodeClientId = generateClientId();

    const stream: ActiveStream = {
      id: streamId,
      chatId,
      parentId,
      speakerId,
      nodeClientId,
      content: "",
      startedAt: Date.now(),
    };

    this.activeStreams.set(streamId, stream);
    this.chatStreams.set(chatId, streamId);

    this.publish(chatId, {
      type: "stream:start",
      chatId,
      streamId,
      parentId,
      speakerId,
      nodeClientId,
    });

    const words = TEST_RESPONSE.split(" ");
    let wordIndex = 0;

    const timer = setInterval(() => {
      if (wordIndex >= words.length) {
        clearInterval(timer);
        this.streamTimers.delete(streamId);
        this.finalizeStream(streamId);
        return;
      }

      const delta = (wordIndex === 0 ? "" : " ") + words[wordIndex];
      stream.content += delta;
      wordIndex++;

      this.publish(chatId, {
        type: "stream:chunk",
        chatId,
        streamId,
        delta,
      });
    }, 80);

    this.streamTimers.set(streamId, timer);
    return streamId;
  }

  // ── AI stream (OpenRouter) ─────────────────────────────────

  /**
   * Start a real AI stream via OpenRouter.
   *
   * Loads the active path from the DB to build the message history,
   * then streams the model's response token-by-token over WebSocket.
   * On completion, persists the full response as a ChatNode.
   */
  startAIStream(
    chatId: string,
    parentId: string,
    speakerId: string,
    model: string,
  ): string | null {
    if (!this.apiKey) return null;
    if (this.chatStreams.has(chatId)) return null;

    const streamId = generateId();
    const nodeClientId = generateClientId();
    const abortController = new AbortController();

    const stream: ActiveStream = {
      id: streamId,
      chatId,
      parentId,
      speakerId,
      nodeClientId,
      content: "",
      startedAt: Date.now(),
      abortController,
    };

    this.activeStreams.set(streamId, stream);
    this.chatStreams.set(chatId, streamId);

    this.publish(chatId, {
      type: "stream:start",
      chatId,
      streamId,
      parentId,
      speakerId,
      nodeClientId,
    });

    // Run the AI stream asynchronously
    this.runAIStream(stream, model).catch((err) => {
      // Only broadcast error if the stream is still active (not cancelled)
      if (this.activeStreams.has(streamId)) {
        this.publish(chatId, {
          type: "stream:error",
          chatId,
          streamId,
          error: err instanceof Error ? err.message : "Unknown error",
        });
        this.activeStreams.delete(streamId);
        this.chatStreams.delete(chatId);
      }
    });

    return streamId;
  }

  private async runAIStream(
    stream: ActiveStream,
    model: string,
  ): Promise<void> {
    const openrouter = createOpenRouter({ apiKey: this.apiKey! });

    // Build message history from the active path
    const chat = getChat(this.db, stream.chatId);
    if (!chat?.root_node_id) throw new Error("Chat has no messages");

    const treeRecord = getChatTree(this.db, stream.chatId);
    const nodesMap = new Map<string, ChatNode>(Object.entries(treeRecord));
    const pathIds = getActivePath(chat.root_node_id, nodesMap);

    const messages = pathIds.map((id) => {
      const node = nodesMap.get(id)!;
      return {
        role: node.is_bot ? ("assistant" as const) : ("user" as const),
        content: node.message,
      };
    });

    const result = streamText({
      model: openrouter.chat(model),
      messages,
      abortSignal: stream.abortController?.signal,
    });

    for await (const delta of result.textStream) {
      // Check if stream was cancelled during iteration
      if (!this.activeStreams.has(stream.id)) return;

      stream.content += delta;

      this.publish(stream.chatId, {
        type: "stream:chunk",
        chatId: stream.chatId,
        streamId: stream.id,
        delta,
      });
    }

    // Finalize only if not cancelled
    if (this.activeStreams.has(stream.id)) {
      this.finalizeStream(stream.id);
    }
  }

  // ── Cancel ─────────────────────────────────────────────────

  /** Cancel an active stream. Aborts AI requests and discards content. */
  cancelStream(chatId: string): boolean {
    const streamId = this.chatStreams.get(chatId);
    if (!streamId) return false;

    const stream = this.activeStreams.get(streamId);
    if (!stream) return false;

    // Abort AI request if running
    stream.abortController?.abort();

    // Stop test stream timer if running
    const timer = this.streamTimers.get(streamId);
    if (timer) {
      clearInterval(timer);
      this.streamTimers.delete(streamId);
    }

    this.publish(chatId, {
      type: "stream:error",
      chatId,
      streamId,
      error: "Stream cancelled",
    });

    this.activeStreams.delete(streamId);
    this.chatStreams.delete(chatId);
    return true;
  }

  // ── Finalize ───────────────────────────────────────────────

  /**
   * Finalize a stream: persist the accumulated content to SQLite
   * as a real ChatNode and broadcast the completion event.
   */
  private finalizeStream(streamId: string): void {
    const stream = this.activeStreams.get(streamId);
    if (!stream) return;

    const result = addMessage(this.db, {
      chat_id: stream.chatId,
      parent_id: stream.parentId,
      message: stream.content,
      speaker_id: stream.speakerId,
      is_bot: true,
      client_id: stream.nodeClientId,
    });

    this.publish(stream.chatId, {
      type: "stream:end",
      chatId: stream.chatId,
      streamId,
      nodeId: result.node.id,
    });

    this.activeStreams.delete(streamId);
    this.chatStreams.delete(stream.chatId);
  }

  // ── Publish ────────────────────────────────────────────────

  /** Broadcast a message to all WebSocket clients subscribed to a chat. */
  private publish(chatId: string, message: ServerWsMessage): void {
    if (!this.server) return;
    this.server.publish(`chat:${chatId}`, JSON.stringify(message));
  }
}
