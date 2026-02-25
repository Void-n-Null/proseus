/**
 * WebSocket message handler.
 *
 * Clients connect to /ws, subscribe to chat topics, and receive
 * stream events. Bun's built-in pub/sub handles fan-out — each
 * chat is a topic, and server.publish() broadcasts to all subscribers.
 */

import type { ServerWebSocket } from "bun";
import type { ClientWsMessage, WsContext } from "../shared/ws-types.ts";
import type { StreamManager } from "./services/stream-manager.ts";

// ── Runtime validation ─────────────────────────────────────────

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function isOptionalString(v: unknown): v is string | undefined {
  return v === undefined || typeof v === "string";
}

function isOptionalBoolean(v: unknown): v is boolean | undefined {
  return v === undefined || typeof v === "boolean";
}

/**
 * Validate a parsed JSON object against the ClientWsMessage union.
 * Returns the validated message or an error string describing the first
 * field that failed validation.
 */
function validateMessage(
  raw: Record<string, unknown>,
): ClientWsMessage | string {
  const type = raw.type;
  if (!isString(type)) return "missing or invalid 'type' field";

  switch (type) {
    case "subscribe":
    case "unsubscribe":
    case "cancel-stream":
      if (!isString(raw.chatId)) return `${type}: missing string 'chatId'`;
      return raw as unknown as ClientWsMessage;

    case "test-stream":
      if (!isString(raw.chatId)) return `${type}: missing string 'chatId'`;
      if (!isString(raw.parentId)) return `${type}: missing string 'parentId'`;
      if (!isString(raw.speakerId))
        return `${type}: missing string 'speakerId'`;
      if (!isString(raw.nodeId)) return `${type}: missing string 'nodeId'`;
      return raw as unknown as ClientWsMessage;

    case "ai-stream":
      if (!isString(raw.chatId)) return `${type}: missing string 'chatId'`;
      if (!isString(raw.parentId)) return `${type}: missing string 'parentId'`;
      if (!isString(raw.speakerId))
        return `${type}: missing string 'speakerId'`;
      if (!isString(raw.model)) return `${type}: missing string 'model'`;
      if (!isString(raw.nodeId)) return `${type}: missing string 'nodeId'`;
      if (!isOptionalString(raw.provider))
        return `${type}: 'provider' must be a string if provided`;
      return raw as unknown as ClientWsMessage;

    case "generate":
      if (!isString(raw.chatId)) return `${type}: missing string 'chatId'`;
      if (!isString(raw.model)) return `${type}: missing string 'model'`;
      if (!isString(raw.nodeId)) return `${type}: missing string 'nodeId'`;
      if (!isOptionalString(raw.provider))
        return `${type}: 'provider' must be a string if provided`;
      if (!isOptionalBoolean(raw.regenerate))
        return `${type}: 'regenerate' must be a boolean if provided`;
      if (!isOptionalString(raw.targetNodeId))
        return `${type}: 'targetNodeId' must be a string if provided`;
      return raw as unknown as ClientWsMessage;

    default:
      return `unknown message type '${type}'`;
  }
}

// ── Handler ────────────────────────────────────────────────────

export function createWebSocketHandler(streamManager: StreamManager) {
  return {
    open(ws: ServerWebSocket<WsContext>) {
      // Connection established, no subscriptions yet
    },

    async message(ws: ServerWebSocket<WsContext>, raw: string | Buffer) {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(typeof raw === "string" ? raw : raw.toString());
      } catch {
        ws.send(JSON.stringify({ type: "error", error: "invalid JSON" }));
        return;
      }

      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        ws.send(JSON.stringify({ type: "error", error: "message must be a JSON object" }));
        return;
      }

      const result = validateMessage(parsed);
      if (typeof result === "string") {
        ws.send(JSON.stringify({ type: "error", error: result }));
        return;
      }

      const msg = result;

      switch (msg.type) {
        case "subscribe": {
          // Idempotent subscribe: duplicate subscribe calls can happen during
          // reconnect races. Guarding here prevents duplicate chunk delivery.
          if (ws.data.subscribedChats.has(msg.chatId)) {
            break;
          }

          const topic = `chat:${msg.chatId}`;
          ws.subscribe(topic);
          ws.data.subscribedChats.add(msg.chatId);

          // If there's an active stream, send current state to this client
          const active = streamManager.getActiveStream(msg.chatId);
          if (active) {
            ws.send(
              JSON.stringify({
                type: "stream:start",
                chatId: active.chatId,
                streamId: active.id,
                parentId: active.parentId,
                speakerId: active.speakerId,
                nodeId: active.nodeId,
              }),
            );
            // Send full accumulated content
            if (active.content.length > 0) {
              ws.send(
                JSON.stringify({
                  type: "stream:content",
                  chatId: active.chatId,
                  streamId: active.id,
                  content: active.content,
                }),
              );
            }
          }
          break;
        }

        case "unsubscribe": {
          if (!ws.data.subscribedChats.has(msg.chatId)) {
            break;
          }
          const topic = `chat:${msg.chatId}`;
          ws.unsubscribe(topic);
          ws.data.subscribedChats.delete(msg.chatId);
          break;
        }

        case "test-stream": {
          streamManager.startTestStream(
            msg.chatId,
            msg.parentId,
            msg.speakerId,
            msg.nodeId,
          );
          break;
        }

        case "ai-stream": {
          await streamManager.startAIStream(
            msg.chatId,
            msg.parentId,
            msg.speakerId,
            msg.model,
            msg.nodeId,
            msg.provider,
          );
          break;
        }

        case "generate": {
          const result = await streamManager.startGeneration(
            msg.chatId,
            msg.model,
            msg.nodeId,
            msg.provider,
            msg.regenerate,
            msg.targetNodeId,
          );
          if ("error" in result) {
            console.warn("[generate]", msg.chatId, result.error);
            ws.send(
              JSON.stringify({
                type: "stream:error",
                chatId: msg.chatId,
                streamId: "",
                error: result.error,
              }),
            );
          }
          break;
        }

        case "cancel-stream": {
          streamManager.cancelStream(msg.chatId);
          break;
        }
      }
    },

    close(ws: ServerWebSocket<WsContext>) {
      // Unsubscribe from all topics on disconnect
      for (const chatId of ws.data.subscribedChats) {
        ws.unsubscribe(`chat:${chatId}`);
      }
    },
  };
}
