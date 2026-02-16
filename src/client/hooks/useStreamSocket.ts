/**
 * WebSocket hook for server-side streaming.
 *
 * Connects to /ws, subscribes to a chat's stream topic, and drives
 * the existing streaming buffer + Zustand store from server events.
 * The client never owns stream state — it displays what the server sends.
 *
 * On reconnect (or late join), the server sends the full accumulated
 * content so the client can pick up mid-stream seamlessly.
 */

import { useEffect, useRef, useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type {
  ClientWsMessage,
  ServerWsMessage,
} from "../../shared/ws-types.ts";
import { useStreamingStore } from "../stores/streaming.ts";
import {
  appendChunk,
  setContent,
  finalizeSession,
  cancelSession,
} from "../lib/streaming-buffer.ts";

export type WsStatus = "connecting" | "connected" | "disconnected";

const API_KEY_STORAGE_KEY = "proseus:openrouter-key";

interface UseStreamSocketReturn {
  status: WsStatus;
  sendTestStream: (parentId: string, speakerId: string) => void;
  sendAIStream: (
    parentId: string,
    speakerId: string,
    model: string,
  ) => void;
  setApiKey: (key: string) => void;
  cancelStream: () => void;
}

export function useStreamSocket(
  chatId: string | null,
): UseStreamSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<WsStatus>("disconnected");
  const qc = useQueryClient();

  const storeStart = useStreamingStore((s) => s.start);
  const storeStop = useStreamingStore((s) => s.stop);

  useEffect(() => {
    if (!chatId) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;
    setStatus("connecting");

    ws.addEventListener("open", () => {
      setStatus("connected");

      // Subscribe to this chat's stream events
      const sub: ClientWsMessage = { type: "subscribe", chatId };
      ws.send(JSON.stringify(sub));

      // Restore API key from localStorage if available
      const savedKey = localStorage.getItem(API_KEY_STORAGE_KEY);
      if (savedKey) {
        const keyMsg: ClientWsMessage = {
          type: "set-api-key",
          provider: "openrouter",
          key: savedKey,
        };
        ws.send(JSON.stringify(keyMsg));
      }
    });

    ws.addEventListener("message", (event) => {
      let msg: ServerWsMessage;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }

      // Only process messages for our chat
      if (msg.chatId !== chatId) return;

      switch (msg.type) {
        case "stream:start": {
          storeStart(msg.parentId, msg.speakerId, msg.nodeClientId);
          break;
        }

        case "stream:chunk": {
          appendChunk(msg.delta);
          break;
        }

        case "stream:content": {
          // Full content on reconnect — replace buffer entirely
          setContent(msg.content);
          break;
        }

        case "stream:end": {
          finalizeSession();
          storeStop();
          // Invalidate tree so the persisted message appears
          qc.invalidateQueries({ queryKey: ["chat-tree", chatId] });
          qc.invalidateQueries({ queryKey: ["chats"] });
          break;
        }

        case "stream:error": {
          cancelSession();
          storeStop();
          break;
        }
      }
    });

    ws.addEventListener("close", () => {
      setStatus("disconnected");
      wsRef.current = null;
    });

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        const unsub: ClientWsMessage = { type: "unsubscribe", chatId };
        ws.send(JSON.stringify(unsub));
      }
      ws.close();
      wsRef.current = null;
      setStatus("disconnected");
    };
  }, [chatId, storeStart, storeStop, qc]);

  const setApiKey = useCallback((key: string) => {
    // Persist locally so it survives page refreshes
    localStorage.setItem(API_KEY_STORAGE_KEY, key);

    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    const msg: ClientWsMessage = {
      type: "set-api-key",
      provider: "openrouter",
      key,
    };
    ws.send(JSON.stringify(msg));
  }, []);

  const sendTestStream = useCallback(
    (parentId: string, speakerId: string) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN || !chatId) return;

      const msg: ClientWsMessage = {
        type: "test-stream",
        chatId,
        parentId,
        speakerId,
      };
      ws.send(JSON.stringify(msg));
    },
    [chatId],
  );

  const sendAIStream = useCallback(
    (parentId: string, speakerId: string, model: string) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN || !chatId) return;

      const msg: ClientWsMessage = {
        type: "ai-stream",
        chatId,
        parentId,
        speakerId,
        model,
      };
      ws.send(JSON.stringify(msg));
    },
    [chatId],
  );

  const cancelStream = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !chatId) return;

    const msg: ClientWsMessage = { type: "cancel-stream", chatId };
    ws.send(JSON.stringify(msg));
  }, [chatId]);

  return { status, sendTestStream, sendAIStream, setApiKey, cancelStream };
}
