/**
 * WebSocket hook for server-side streaming.
 *
 * Connects to /ws, subscribes to a chat's stream topic, and drives
 * the existing streaming buffer + Zustand store from server events.
 * The client never owns stream state — it displays what the server sends.
 *
 * On reconnect (or late join), the server sends the full accumulated
 * content so the client can pick up mid-stream seamlessly.
 *
 * When streaming starts (either initiated locally or received from the
 * server), a placeholder node is optimistically inserted into the
 * TanStack Query tree cache so MessageItem can render immediately
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
          // Optimistically insert placeholder node into the tree cache.
          // This gives MessageItem a real node to render with the final key.
          insertPlaceholderNode(
            qc,
            chatId,
            msg.nodeId,
            msg.parentId,
            msg.speakerId,
          );
          storeStart(msg.parentId, msg.speakerId, msg.nodeId);
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
          // Capture the final content BEFORE clearing the buffer.
          const finalContent = finalizeSession();

          // Patch the placeholder node's message in the cache BEFORE
          // stopping streaming. This ensures that when MessageContent
          // switches from buffer mode (isStreaming=true) to normal mode
          // (isStreaming=false), node.message already has the real text.
          // Without this: buffer clears → message="" → flash of empty → refetch fills it.
          const meta = useStreamingStore.getState().meta;
          if (meta) {
            const treeKey = ["chat-tree", chatId];
            const current = qc.getQueryData<TreeData>(treeKey);
            if (current) {
              const node = current.nodes.get(meta.nodeId);
              if (node) {
                const newNodes = new Map(current.nodes);
                newNodes.set(meta.nodeId, { ...node, message: finalContent });
                qc.setQueryData<TreeData>(treeKey, { ...current, nodes: newNodes });
              }
            }
          }

          storeStop();

          // Reconcile with server in the background. The message content
          // is already correct, so React.memo prevents a re-render.
          // This just picks up server-side timestamps and any other metadata.
          qc.invalidateQueries({ queryKey: ["chat-tree", chatId] });
          qc.invalidateQueries({ queryKey: ["chats"] });
          break;
        }

        case "stream:error": {
          // Roll back the optimistic placeholder
          const meta = useStreamingStore.getState().meta;
          if (meta) {
            removePlaceholderNode(qc, chatId, meta.nodeId, meta.parentId);
          }
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

      const nodeId = generateId();
      const msg: ClientWsMessage = {
        type: "test-stream",
        chatId,
        parentId,
        speakerId,
        nodeId,
      };
      ws.send(JSON.stringify(msg));
    },
    [chatId],
  );

  const sendAIStream = useCallback(
    (parentId: string, speakerId: string, model: string) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN || !chatId) return;

      const nodeId = generateId();
      const msg: ClientWsMessage = {
        type: "ai-stream",
        chatId,
        parentId,
        speakerId,
        model,
        nodeId,
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
