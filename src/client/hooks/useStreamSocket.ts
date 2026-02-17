/**
 * WebSocket hook for server-side streaming.
 *
 * Architecture: ONE WebSocket connection per app lifetime. Chat switching
 * sends subscribe/unsubscribe messages — it does NOT tear down the socket.
 *
 * - Connection effect (empty deps): creates WS, restores API key, handles
 *   reconnect. Runs once on mount, cleans up on unmount.
 * - Subscription effect (chatId dep): sends subscribe/unsubscribe when the
 *   active chat changes. Lightweight, no WS teardown.
 *
 * On reconnect (or late join), the server sends the full accumulated
 * content so the client can pick up mid-stream seamlessly.
 *
 * When streaming starts, a placeholder node is optimistically inserted
 * into the TanStack Query tree cache so MessageItem can render immediately
 * with the same React key that will persist after finalization.
 */

import { useEffect, useRef, useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type {
  ClientWsMessage,
  ServerWsMessage,
} from "../../shared/ws-types.ts";
import type { ChatNode } from "../../shared/types.ts";
import { generateId } from "../../shared/ids.ts";
import { useStreamingStore } from "../stores/streaming.ts";
import {
  appendChunk,
  setContent,
  finalizeSession,
  cancelSession,
} from "../lib/streaming-buffer.ts";

export type WsStatus = "connecting" | "connected" | "disconnected";

const API_KEY_STORAGE_KEY = "proseus:openrouter-key";

/**
 * Shape of the cached tree data in TanStack Query.
 * Matches the return type of useChatTree's queryFn.
 */
interface TreeData {
  nodes: Map<string, ChatNode>;
  rootNodeId: string | null;
}

interface UseStreamSocketReturn {
  status: WsStatus;
  sendTestStream: (parentId: string, speakerId: string) => void;
  sendAIStream: (
    parentId: string,
    speakerId: string,
    model: string,
  ) => void;
  /** Trigger generation — server resolves parentId and speakerId from DB. */
  sendGenerate: (model: string) => void;
  setApiKey: (key: string) => void;
  cancelStream: () => void;
}

/**
 * Insert a placeholder node into the TanStack Query tree cache.
 * This lets MessageItem render immediately with the final React key.
 */
function insertPlaceholderNode(
  qc: ReturnType<typeof useQueryClient>,
  chatId: string,
  nodeId: string,
  parentId: string,
  speakerId: string,
): void {
  const treeKey = ["chat-tree", chatId];
  const previous = qc.getQueryData<TreeData>(treeKey);
  if (!previous) return;

  const placeholder: ChatNode = {
    id: nodeId,
    client_id: null,
    parent_id: parentId,
    child_ids: [],
    active_child_index: null,
    speaker_id: speakerId,
    message: "",
    is_bot: true,
    created_at: Date.now(),
    updated_at: null,
  };

  const newNodes = new Map(previous.nodes);
  newNodes.set(nodeId, placeholder);

  // Update parent's child_ids and active_child_index
  const parent = newNodes.get(parentId);
  if (parent) {
    const newChildIds = [...parent.child_ids, nodeId];
    newNodes.set(parentId, {
      ...parent,
      child_ids: newChildIds,
      active_child_index: newChildIds.length - 1,
    });
  }

  qc.setQueryData<TreeData>(treeKey, { ...previous, nodes: newNodes });
}

/**
 * Remove a placeholder node from the TanStack Query tree cache.
 * Used on stream cancel/error to roll back the optimistic insertion.
 */
function removePlaceholderNode(
  qc: ReturnType<typeof useQueryClient>,
  chatId: string,
  nodeId: string,
  parentId: string,
): void {
  const treeKey = ["chat-tree", chatId];
  const current = qc.getQueryData<TreeData>(treeKey);
  if (!current) return;

  const newNodes = new Map(current.nodes);
  newNodes.delete(nodeId);

  // Restore parent's child_ids
  const parent = newNodes.get(parentId);
  if (parent) {
    const newChildIds = parent.child_ids.filter((id) => id !== nodeId);
    const newIndex =
      newChildIds.length === 0
        ? null
        : Math.min(parent.active_child_index ?? 0, newChildIds.length - 1);
    newNodes.set(parentId, {
      ...parent,
      child_ids: newChildIds,
      active_child_index: newIndex,
    });
  }

  qc.setQueryData<TreeData>(treeKey, { ...current, nodes: newNodes });
}

/** Send a message on a WebSocket if it's open. */
function wsSend(ws: WebSocket | null, msg: ClientWsMessage): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

export function useStreamSocket(
  chatId: string | null,
): UseStreamSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<WsStatus>("disconnected");
  const qc = useQueryClient();

  // Use refs for streaming store functions so they don't cause
  // the connection effect to re-run when streaming state changes.
  const storeStartRef = useRef(useStreamingStore.getState().start);
  const storeStopRef = useRef(useStreamingStore.getState().stop);

  // Keep a ref to the current chatId so the message handler
  // (which lives in the connection effect) can read it without
  // the connection effect depending on chatId.
  const chatIdRef = useRef(chatId);
  chatIdRef.current = chatId;

  // ── Connection effect: ONE WebSocket for the app lifetime ──
  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;
    setStatus("connecting");

    ws.addEventListener("open", () => {
      setStatus("connected");

      // Restore API key from localStorage if available
      const savedKey = localStorage.getItem(API_KEY_STORAGE_KEY);
      if (savedKey) {
        wsSend(ws, {
          type: "set-api-key",
          provider: "openrouter",
          key: savedKey,
        });
      }

      // If we already have a chatId, subscribe now
      const currentChatId = chatIdRef.current;
      if (currentChatId) {
        wsSend(ws, { type: "subscribe", chatId: currentChatId });
      }
    });

    ws.addEventListener("message", (event) => {
      let msg: ServerWsMessage;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }

      // Only process messages for the currently active chat
      const currentChatId = chatIdRef.current;
      if (msg.chatId !== currentChatId) return;

      switch (msg.type) {
        case "stream:start": {
          insertPlaceholderNode(
            qc,
            msg.chatId,
            msg.nodeId,
            msg.parentId,
            msg.speakerId,
          );
          storeStartRef.current(msg.parentId, msg.speakerId, msg.nodeId);
          break;
        }

        case "stream:chunk": {
          appendChunk(msg.delta);
          break;
        }

        case "stream:content": {
          setContent(msg.content);
          break;
        }

        case "stream:end":
        case "stream:cancelled": {
          const finalContent = finalizeSession();

          const meta = useStreamingStore.getState().meta;
          if (meta && currentChatId) {
            const treeKey = ["chat-tree", currentChatId];
            const current = qc.getQueryData<TreeData>(treeKey);
            if (current) {
              const node = current.nodes.get(meta.nodeId);
              if (node) {
                const newNodes = new Map(current.nodes);
                newNodes.set(meta.nodeId, { ...node, message: finalContent });
                qc.setQueryData<TreeData>(treeKey, {
                  ...current,
                  nodes: newNodes,
                });
              }
            }
          }

          storeStopRef.current();

          if (currentChatId) {
            qc.invalidateQueries({ queryKey: ["chat-tree", currentChatId] });
            qc.invalidateQueries({ queryKey: ["chats"] });
          }
          break;
        }

        case "stream:error": {
          const meta = useStreamingStore.getState().meta;
          if (meta && currentChatId) {
            removePlaceholderNode(qc, currentChatId, meta.nodeId, meta.parentId);
          }
          cancelSession();
          storeStopRef.current();
          break;
        }
      }
    });

    ws.addEventListener("close", () => {
      setStatus("disconnected");
      wsRef.current = null;
    });

    return () => {
      ws.close();
      wsRef.current = null;
      setStatus("disconnected");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally empty: one connection per mount
  }, [qc]);

  // ── Subscription effect: lightweight chat topic switching ──
  useEffect(() => {
    const ws = wsRef.current;
    if (!chatId) return;

    // Subscribe when entering a chat
    wsSend(ws, { type: "subscribe", chatId });

    // Also handle late-open: if WS wasn't connected when this effect
    // ran, the connection effect's open handler will subscribe using
    // chatIdRef.current.

    return () => {
      // Unsubscribe when leaving this chat (but keep the WS alive)
      wsSend(wsRef.current, { type: "unsubscribe", chatId });
    };
  }, [chatId]);

  // ── Actions ───────────────────────────────────────────────

  const setApiKey = useCallback((key: string) => {
    localStorage.setItem(API_KEY_STORAGE_KEY, key);
    wsSend(wsRef.current, {
      type: "set-api-key",
      provider: "openrouter",
      key,
    });
  }, []);

  const sendTestStream = useCallback(
    (parentId: string, speakerId: string) => {
      if (!chatId) return;
      const nodeId = generateId();
      wsSend(wsRef.current, {
        type: "test-stream",
        chatId,
        parentId,
        speakerId,
        nodeId,
      });
    },
    [chatId],
  );

  const sendAIStream = useCallback(
    (parentId: string, speakerId: string, model: string) => {
      if (!chatId) return;
      const nodeId = generateId();
      wsSend(wsRef.current, {
        type: "ai-stream",
        chatId,
        parentId,
        speakerId,
        model,
        nodeId,
      });
    },
    [chatId],
  );

  const sendGenerate = useCallback(
    (model: string) => {
      if (!chatId) return;
      const nodeId = generateId();
      wsSend(wsRef.current, {
        type: "generate",
        chatId,
        model,
        nodeId,
      });
    },
    [chatId],
  );

  const cancelStream = useCallback(() => {
    if (!chatId) return;
    wsSend(wsRef.current, { type: "cancel-stream", chatId });
  }, [chatId]);

  return {
    status,
    sendTestStream,
    sendAIStream,
    sendGenerate,
    setApiKey,
    cancelStream,
  };
}
