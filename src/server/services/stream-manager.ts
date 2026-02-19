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
 *
 * Node IDs are provided by the client and validated by the server
 * at persistence time (format + uniqueness check). This allows the
 * client to use the same ID as a React key from stream start through
 * finalization — no component swap, no visual flash.
 */

import type { Server } from "bun";
import type { Database } from "bun:sqlite";
import { streamText } from "ai";
import type { ServerWsMessage, WsContext } from "../../shared/ws-types.ts";
import { generateId } from "../../shared/ids.ts";
import { addMessage, getChatTree } from "../db/messages.ts";
import { getChat } from "../db/chats.ts";
import { getActivePath } from "../../shared/tree.ts";
import type { ChatNode } from "../../shared/types.ts";
import { assemblePrompt } from "./chat-pipeline.ts";
import type { ProviderName } from "../../shared/providers.ts";
import { createModel } from "../lib/llm.ts";
import { getApiKey } from "../db/connections.ts";

// ── Types ──────────────────────────────────────────────────────

interface ActiveStream {
  id: string;
  chatId: string;
  parentId: string;
  speakerId: string;
  nodeId: string;
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

  constructor(db: Database) {
    this.db = db;
  }

  /** Must be called after Bun.serve() to enable pub/sub broadcasting. */
  setServer(server: Server<WsContext>): void {
    this.server = server;
  }

  /** Check if a provider has a configured API key. */
  async hasApiKey(provider: ProviderName = "openrouter"): Promise<boolean> {
    return (await getApiKey(this.db, provider)) !== null;
  }

  /** Get the active stream for a chat, if any. */
  getActiveStream(chatId: string): ActiveStream | null {
    const streamId = this.chatStreams.get(chatId);
    if (!streamId) return null;
    return this.activeStreams.get(streamId) ?? null;
  }

  // ── Generate (decoupled) ──────────────────────────────────

  /**
   * Start AI generation for a chat. The server resolves parentId
   * (leaf of the active path) and speakerId (first bot speaker in
   * the chat) from the DB — the client only needs to provide the
   * chatId, model, and a pre-generated nodeId.
   *
   * This decouples generation from message creation: the client can
   * trigger generation after sending a message, or independently
   * (regenerate, continue, etc.).
   *
   * Returns the streamId, or null with an error string.
   */
  async startGeneration(
    chatId: string,
    model: string,
    nodeId: string,
    provider: ProviderName = "openrouter",
  ): Promise<{ streamId: string } | { error: string }> {
    if (!(await this.hasApiKey(provider))) return { error: `No API key configured for ${provider}` };
    if (this.chatStreams.has(chatId)) return { error: "Chat already streaming" };

    // Resolve parentId: leaf of the active path
    const chat = getChat(this.db, chatId);
    if (!chat?.root_node_id) return { error: "Chat has no messages" };

    const treeRecord = getChatTree(this.db, chatId);
    const nodesMap = new Map<string, ChatNode>(Object.entries(treeRecord));
    const pathIds = getActivePath(chat.root_node_id, nodesMap);

    if (pathIds.length === 0) return { error: "Chat has no active path" };
    const parentId = pathIds[pathIds.length - 1]!;

    // Resolve speakerId: first non-user speaker in the chat
    const speakerRows = this.db
      .query(
        `SELECT s.id FROM chat_speakers cs
         JOIN speakers s ON s.id = cs.speaker_id
         WHERE cs.chat_id = $chatId AND s.is_user = 0
         LIMIT 1`,
      )
      .get({ $chatId: chatId }) as { id: string } | null;

    if (!speakerRows) return { error: "Chat has no bot speaker" };
    const speakerId = speakerRows.id;

    // Delegate to the existing startAIStream with resolved values
    const streamId = await this.startAIStream(chatId, parentId, speakerId, model, nodeId, provider);
    if (!streamId) return { error: "Failed to start stream" };
    return { streamId };
  }

  // ── Test stream ────────────────────────────────────────────

  /**
   * Start a test stream that simulates AI token generation.
   * Streams the test content word-by-word at ~80ms intervals.
   *
   * @param nodeId - Client-provided ID for the node to be created.
   */
  startTestStream(
    chatId: string,
    parentId: string,
    speakerId: string,
    nodeId: string,
  ): string | null {
    if (this.chatStreams.has(chatId)) return null;

    const streamId = generateId();

    const stream: ActiveStream = {
      id: streamId,
      chatId,
      parentId,
      speakerId,
      nodeId,
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
      nodeId,
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
   * On completion, persists the full response as a ChatNode using
   * the client-provided nodeId.
   *
   * @param nodeId - Client-provided ID for the node to be created.
   */
  async startAIStream(
    chatId: string,
    parentId: string,
    speakerId: string,
    model: string,
    nodeId: string,
    provider: ProviderName = "openrouter",
  ): Promise<string | null> {
    if (!(await this.hasApiKey(provider))) return null;
    if (this.chatStreams.has(chatId)) return null;

    const streamId = generateId();
    const abortController = new AbortController();

    const stream: ActiveStream = {
      id: streamId,
      chatId,
      parentId,
      speakerId,
      nodeId,
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
      nodeId,
    });

    // Run the AI stream asynchronously
    this.runAIStream(stream, model, provider).catch((err) => {
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
    provider: ProviderName = "openrouter",
  ): Promise<void> {
    const aiModel = await createModel(this.db, provider, model);

    // Assemble the full prompt from character + chat history
    const prompt = assemblePrompt(this.db, stream.chatId);
    if (!prompt || prompt.messages.length === 0) {
      throw new Error("Chat has no messages or could not assemble prompt");
    }

    const result = streamText({
      model: aiModel,
      messages: prompt.messages,
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

  /**
   * Cancel an active stream. Aborts the AI request (stops billing)
   * and persists whatever content has accumulated so far. If no
   * content was generated before cancellation, rolls back with an
   * error event instead.
   */
  cancelStream(chatId: string): boolean {
    const streamId = this.chatStreams.get(chatId);
    if (!streamId) return false;

    const stream = this.activeStreams.get(streamId);
    if (!stream) return false;

    // Abort AI request if running — stops billing immediately
    stream.abortController?.abort();

    // Stop test stream timer if running
    const timer = this.streamTimers.get(streamId);
    if (timer) {
      clearInterval(timer);
      this.streamTimers.delete(streamId);
    }

    if (stream.content.length > 0) {
      // Persist partial content — don't throw away what we have
      const result = addMessage(this.db, {
        chat_id: stream.chatId,
        parent_id: stream.parentId,
        message: stream.content,
        speaker_id: stream.speakerId,
        is_bot: true,
        id: stream.nodeId,
      });

      this.publish(chatId, {
        type: "stream:cancelled",
        chatId,
        streamId,
        nodeId: result.node.id,
      });
    } else {
      // Nothing generated — roll back the optimistic placeholder
      this.publish(chatId, {
        type: "stream:error",
        chatId,
        streamId,
        error: "Stream cancelled before any content was generated",
      });
    }

    this.activeStreams.delete(streamId);
    this.chatStreams.delete(chatId);
    return true;
  }

  // ── Finalize ───────────────────────────────────────────────

  /**
   * Finalize a stream: persist the accumulated content to SQLite
   * as a real ChatNode using the client-provided nodeId, then
   * broadcast the completion event.
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
      id: stream.nodeId,
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
