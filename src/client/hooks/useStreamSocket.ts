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
 * Reconnection: On unexpected close, the hook automatically reconnects
 * with exponential backoff (1s → 2s → 4s → ... → 30s cap) plus jitter.
 * On successful reconnect, re-subscribes to the active chat so the server
 * can send full accumulated content for any in-progress stream.
 *
 * When streaming starts, a placeholder node is optimistically inserted
 * into the TanStack Query tree cache so MessageItem can render immediately
 * with the same React key that will persist after finalization.
 */

import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type {
  ClientWsMessage,
  ServerWsMessage,
} from "../../shared/ws-types.ts";
import type { ChatNode } from "../../shared/types.ts";
import type { ProviderName } from "../../shared/providers.ts";
import { generateId } from "../../shared/ids.ts";
import { useStreamingStore } from "../stores/streaming.ts";
import {
  useConnectionStore,
  useConnectionStatus,
  type ConnectionStatus,
} from "../stores/connection.ts";
import {
  appendChunk,
  setContent,
  finalizeSession,
  cancelSession,
} from "../lib/streaming-buffer.ts";

// ---------------------------------------------------------------------------
// Reconnection constants
// ---------------------------------------------------------------------------

/** Initial delay before first reconnect attempt (ms). */
const RECONNECT_BASE_MS = 1_000;
/** Maximum delay between reconnect attempts (ms). */
const RECONNECT_MAX_MS = 30_000;
/** Multiplier for exponential backoff. */
const RECONNECT_MULTIPLIER = 2;
/** Random jitter range as a fraction of the computed delay (0–1). */
const RECONNECT_JITTER = 0.3;

/** Compute the delay for a given attempt number, with jitter. */
function reconnectDelay(attempt: number): number {
  const base = Math.min(
    RECONNECT_BASE_MS * Math.pow(RECONNECT_MULTIPLIER, attempt),
    RECONNECT_MAX_MS,
  );
  const jitter = base * RECONNECT_JITTER * Math.random();
  return base + jitter;
}

// Re-export for backward compatibility (ChatPage, StreamDebug still use WsStatus)
export type WsStatus = ConnectionStatus;

/**
 * Shape of the cached tree data in TanStack Query.
 * Matches the return type of useChatTree's queryFn.
 */
interface TreeData {
  nodes: Map<string, ChatNode>;
  rootNodeId: string | null;
}

interface UseStreamSocketReturn {
  status: ConnectionStatus;
  sendTestStream: (parentId: string, speakerId: string) => void;
  sendAIStream: (
    parentId: string,
    speakerId: string,
    model: string,
  ) => void;
  /** Trigger generation — server resolves parentId and speakerId from DB. */
  sendGenerate: (model: string, provider?: ProviderName, regenerate?: boolean) => void;
  cancelStream: () => void;
}

/**
 * Insert a placeholder node into the TanStack Query tree cache.
 * This lets MessageItem render immediately with the final React key.
 *
 * Returns `true` if insertion succeeded (tree data was available),
 * `false` if the tree isn't loaded yet and insertion should be retried.
 *
 * On reconnect/refresh, the tree may already contain the node (fetched
 * from the DB before the WS `stream:start` arrived). In that case we
 * skip insertion but still ensure the parent's active_child_index
 * points to the streaming node.
 */
function insertPlaceholderNode(
  qc: ReturnType<typeof useQueryClient>,
  chatId: string,
  nodeId: string,
  parentId: string,
  speakerId: string,
): boolean {
  const treeKey = ["chat-tree", chatId];
  const previous = qc.getQueryData<TreeData>(treeKey);
  if (!previous) return false;

  const newNodes = new Map(previous.nodes);

  // If the node already exists (DB fetch beat the WS message), skip
  // creating a placeholder but still ensure active_child_index is correct.
  if (!newNodes.has(nodeId)) {
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
    newNodes.set(nodeId, placeholder);
  }

  // Update parent's child_ids and active_child_index
  const parent = newNodes.get(parentId);
  if (parent) {
    // Only add to child_ids if not already present (idempotent)
    const alreadyChild = parent.child_ids.includes(nodeId);
    const newChildIds = alreadyChild
      ? parent.child_ids
      : [...parent.child_ids, nodeId];
    const newIndex = newChildIds.indexOf(nodeId);
    newNodes.set(parentId, {
      ...parent,
      child_ids: newChildIds,
      active_child_index: newIndex >= 0 ? newIndex : newChildIds.length - 1,
    });
  }

  qc.setQueryData<TreeData>(treeKey, { ...previous, nodes: newNodes });
  return true;
}

/** Maximum number of placeholder insertion retries. */
const PLACEHOLDER_MAX_RETRIES = 30;
/** Interval between retries (ms). Tree queries typically resolve in <200ms. */
const PLACEHOLDER_RETRY_INTERVAL = 100;

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
  const qc = useQueryClient();

  // Connection store for global status
  const connStore = useConnectionStore;
  const status = useConnectionStatus();

  // Use refs for streaming store functions so they don't cause
  // the connection effect to re-run when streaming state changes.
  const storeStartRef = useRef(useStreamingStore.getState().start);
  const storeStopRef = useRef(useStreamingStore.getState().stop);

  // Keep a ref to the current chatId so the message handler
  // (which lives in the connection effect) can read it without
  // the connection effect depending on chatId.
  const chatIdRef = useRef(chatId);
  chatIdRef.current = chatId;

  // Reconnection state managed via refs (not React state — no re-renders).
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Set to true during intentional cleanup (unmount). Prevents reconnect. */
  const intentionalCloseRef = useRef(false);

  // ── WebSocket factory ──────────────────────────────────────────
  const createWebSocket = useCallback(() => {
    // Clean up any existing connection
    if (wsRef.current) {
      // Prevent the close handler from triggering reconnect
      intentionalCloseRef.current = true;
      wsRef.current.close();
      intentionalCloseRef.current = false;
      wsRef.current = null;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    const isReconnect = reconnectAttemptRef.current > 0;
    connStore.getState().setStatus(isReconnect ? 'reconnecting' : 'connecting');

    ws.addEventListener("open", () => {
      // Success — reset reconnect counter, update store
      reconnectAttemptRef.current = 0;
      connStore.getState().markConnected();

      // (Re-)subscribe to the active chat
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
          const inserted = insertPlaceholderNode(
            qc,
            msg.chatId,
            msg.nodeId,
            msg.parentId,
            msg.speakerId,
          );

          if (!inserted) {
            // Tree data not loaded yet — retry until it is.
            // This race happens on refresh: the WS reconnects and
            // receives stream:start before the tree HTTP query resolves.
            // The node is NOT in the DB yet (only persisted on stream:end),
            // so the placeholder is the only way it appears in the tree.
            let retries = 0;
            const retryInsert = () => {
              if (insertPlaceholderNode(qc, msg.chatId, msg.nodeId, msg.parentId, msg.speakerId)) {
                return; // Success
              }
              if (++retries < PLACEHOLDER_MAX_RETRIES) {
                setTimeout(retryInsert, PLACEHOLDER_RETRY_INTERVAL);
              }
            };
            setTimeout(retryInsert, PLACEHOLDER_RETRY_INTERVAL);
          }

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
      wsRef.current = null;

      // If this was intentional (unmount), don't reconnect
      if (intentionalCloseRef.current) {
        connStore.getState().markDisconnected();
        return;
      }

      // Unintentional close — schedule reconnect with backoff
      const attempt = reconnectAttemptRef.current;
      const delay = reconnectDelay(attempt);
      reconnectAttemptRef.current = attempt + 1;

      connStore.getState().markReconnecting(attempt + 1);

      console.warn(
        `[ws] Connection lost. Reconnecting in ${(delay / 1000).toFixed(1)}s (attempt ${attempt + 1})...`,
      );

      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        createWebSocket();
      }, delay);
    });

    ws.addEventListener("error", () => {
      // The error event is always followed by a close event,
      // so reconnection is handled in the close handler.
      // We just log here for debugging.
      console.warn("[ws] WebSocket error occurred.");
    });
  }, [qc, connStore]);

  // ── Connection effect: ONE WebSocket for the app lifetime ──
  useEffect(() => {
    intentionalCloseRef.current = false;
    createWebSocket();

    return () => {
      // Intentional unmount — clean up without triggering reconnect
      intentionalCloseRef.current = true;

      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }

      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      connStore.getState().markDisconnected();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally stable: one connection per mount
  }, [createWebSocket]);

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
    (model: string, provider?: ProviderName, regenerate?: boolean) => {
      if (!chatId) return;
      const nodeId = generateId();
      wsSend(wsRef.current, {
        type: "generate",
        chatId,
        model,
        nodeId,
        ...(provider ? { provider } : {}),
        ...(regenerate ? { regenerate: true } : {}),
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
    cancelStream,
  };
}
