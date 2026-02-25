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
import { upsertUsage } from "../db/usage.ts";
import { getModelPricing, computeCost, sanitizeTokens } from "../lib/model-pricing.ts";

// ── Safety limits ──────────────────────────────────────────────

/** Maximum wall-clock duration for a single stream (10 minutes). */
const MAX_STREAM_DURATION_MS = 600_000;

/** Maximum accumulated content length before forced cancellation (500k chars ≈ ~125k tokens). */
const MAX_STREAM_CONTENT_LENGTH = 500_000;

// ── Error extraction ───────────────────────────────────────────

/**
 * Extract a clean, user-facing error message from AI SDK errors.
 *
 * AI SDK's `APICallError` includes a `data` field with the parsed
 * provider response (e.g. `{ error: { message: "..." } }`) and a
 * `responseBody` with the raw JSON. We prefer the provider's clean
 * message over the verbose SDK error string.
 */
function extractErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) return "Unknown error";

  // AI SDK APICallError — extract clean message from provider response
  const apiErr = err as Error & {
    data?: { error?: { message?: string } };
    responseBody?: string;
    statusCode?: number;
  };

  // Try the parsed data.error.message first (cleanest)
  if (typeof apiErr.data?.error?.message === "string") {
    return apiErr.data.error.message;
  }

  // Fall back to err.message — but strip the verbose AI SDK prefix if present
  return err.message;
}

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
  assistantPrefill: string | null;
  /** Provider used for this stream (for cost tracking). */
  provider?: ProviderName;
  /** Model ID used for this stream (for cost tracking). */
  model?: string;
  /** The streamText result — stored so usage can be awaited on finalize/cancel. */
  streamResult?: ReturnType<typeof streamText>;
  /** Safety-net timeout that forces cancellation after MAX_STREAM_DURATION_MS. */
  durationTimeout?: Timer;
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
    regenerate?: boolean,
    targetNodeId?: string,
  ): Promise<{ streamId: string } | { error: string }> {
    if (!(await this.hasApiKey(provider))) return { error: `No API key configured for ${provider}` };
    if (this.chatStreams.has(chatId)) return { error: "Chat already streaming" };

    const chat = getChat(this.db, chatId);
    if (!chat?.root_node_id) return { error: "Chat has no messages" };

    const treeRecord = getChatTree(this.db, chatId);
    const nodesMap = new Map<string, ChatNode>(Object.entries(treeRecord));
    const pathIds = getActivePath(chat.root_node_id, nodesMap);

    if (pathIds.length === 0) return { error: "Chat has no active path" };

    let parentId: string;
    if (regenerate && targetNodeId) {
      // Per-message regenerate: branch from the parent of the specified node.
      // The target node might be anywhere in the tree, not just on the active path.
      const targetNode = nodesMap.get(targetNodeId);
      if (!targetNode) return { error: "Target node not found" };
      if (!targetNode.parent_id) return { error: "Cannot regenerate root node" };
      parentId = targetNode.parent_id;
    } else if (regenerate) {
      // Legacy regenerate: branch from the parent of the active path leaf
      if (pathIds.length < 2) return { error: "Cannot regenerate: no parent to branch from" };
      parentId = pathIds[pathIds.length - 2]!;
    } else {
      parentId = pathIds[pathIds.length - 1]!;
    }

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
      assistantPrefill: null,
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
      assistantPrefill: null,
      provider,
      model,
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
        // Clear duration timeout if set
        if (stream.durationTimeout) {
          clearTimeout(stream.durationTimeout);
          stream.durationTimeout = undefined;
        }

        // Swallow rejected internal promises from the AI SDK result object
        // to prevent unhandled rejection noise in the console. The error
        // from textStream is the same one — we just need to consume these.
        // AI SDK uses PromiseLike (not Promise), so use .then(null, noop).
        if (stream.streamResult) {
          const noop = () => {};
          stream.streamResult.usage.then(noop, noop);
          stream.streamResult.response.then(noop, noop);
        }

        const error = extractErrorMessage(err);
        console.warn(`[stream] Stream ${streamId} failed:`, error);

        this.publish(chatId, {
          type: "stream:error",
          chatId,
          streamId,
          error,
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

    const prompt = assemblePrompt(this.db, stream.chatId, stream.parentId);
    if (!prompt || prompt.messages.length === 0) {
      throw new Error("Chat has no messages or could not assemble prompt");
    }

    stream.assistantPrefill = prompt.assistantPrefill;

    const finalMessages = prompt.assistantPrefill
      ? [
          ...prompt.messages,
          { role: "assistant" as const, content: prompt.assistantPrefill },
        ]
      : prompt.messages;

    const result = streamText({
      model: aiModel,
      messages: finalMessages,
      abortSignal: stream.abortController?.signal,
    });

    // Store result so cancelStream can also access usage
    stream.streamResult = result;

    // Safety net: force-cancel after MAX_STREAM_DURATION_MS even if the
    // provider never sends a stop token. cancelStream handles cleanup.
    stream.durationTimeout = setTimeout(() => {
      if (this.activeStreams.has(stream.id)) {
        console.warn(
          `[stream] Stream ${stream.id} exceeded ${MAX_STREAM_DURATION_MS}ms duration limit — force cancelling`,
        );
        this.cancelStream(stream.chatId);
      }
    }, MAX_STREAM_DURATION_MS);

    for await (const delta of result.textStream) {
      // Check if stream was cancelled during iteration
      if (!this.activeStreams.has(stream.id)) break;

      stream.content += delta;

      // Check content size limit
      if (stream.content.length >= MAX_STREAM_CONTENT_LENGTH) {
        console.warn(
          `[stream] Stream ${stream.id} exceeded ${MAX_STREAM_CONTENT_LENGTH} char content limit — force cancelling`,
        );
        this.cancelStream(stream.chatId);
        break;
      }

      this.publish(stream.chatId, {
        type: "stream:chunk",
        chatId: stream.chatId,
        streamId: stream.id,
        delta,
      });
    }

    // Clear the duration safety net (stream completed normally)
    if (stream.durationTimeout) {
      clearTimeout(stream.durationTimeout);
      stream.durationTimeout = undefined;
    }

    // Finalize only if not cancelled
    if (this.activeStreams.has(stream.id)) {
      // Record usage before finalizing (non-blocking — don't fail the stream)
      await this.recordUsage(stream).catch((err: unknown) => {
        console.warn("[usage] Failed to record usage for stream", stream.id, err);
      });
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

    // Clear duration safety-net timeout
    if (stream.durationTimeout) {
      clearTimeout(stream.durationTimeout);
      stream.durationTimeout = undefined;
    }

    // Stop test stream timer if running
    const timer = this.streamTimers.get(streamId);
    if (timer) {
      clearInterval(timer);
      this.streamTimers.delete(streamId);
    }

    if (stream.content.length > 0) {
      // Record usage for partial stream (fire-and-forget, don't block cancel)
      this.recordUsage(stream).catch((err: unknown) => {
        console.warn("[usage] Failed to record usage for cancelled stream", streamId, err);
      });

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

  // ── Usage tracking ──────────────────────────────────────────

  /**
   * Record token usage and cost for a stream.
   * Awaits the AI SDK's usage promise and upserts into usage_logs.
   * Safe to call on cancelled streams — handles rejected promises.
   */
  private async recordUsage(stream: ActiveStream): Promise<void> {
    if (!stream.streamResult || !stream.provider || !stream.model) return;

    let usage: { inputTokens: number | undefined; outputTokens: number | undefined };
    try {
      usage = await stream.streamResult.usage;
    } catch {
      // Aborted streams may reject the usage promise
      return;
    }

    const promptTokens = sanitizeTokens(usage.inputTokens);
    const completionTokens = sanitizeTokens(usage.outputTokens);

    // Skip if no tokens were consumed
    if (promptTokens === 0 && completionTokens === 0) return;

    const pricing = await getModelPricing(stream.provider, stream.model);
    const costUsd = pricing ? computeCost(promptTokens, completionTokens, pricing) : 0;

    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    upsertUsage(this.db, {
      date: today,
      provider: stream.provider,
      model: stream.model,
      chatId: stream.chatId,
      speakerId: stream.speakerId,
      promptTokens,
      completionTokens,
      costUsd,
      inputPrice: pricing?.inputPrice ?? null,
      outputPrice: pricing?.outputPrice ?? null,
    });
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
