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

export function createWebSocketHandler(streamManager: StreamManager) {
  return {
    open(ws: ServerWebSocket<WsContext>) {
      // Connection established, no subscriptions yet
    },

    async message(ws: ServerWebSocket<WsContext>, raw: string | Buffer) {
      let msg: ClientWsMessage;
      try {
        msg = JSON.parse(typeof raw === "string" ? raw : raw.toString());
      } catch {
        return; // Ignore malformed messages
      }

      switch (msg.type) {
        case "subscribe": {
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
