import React, { useRef, useMemo, useEffect, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { ActivePath, ChatNode, Speaker } from "../../../shared/types.ts";
import { getSiblingInfo } from "../../../shared/tree.ts";
import { useIsStreaming } from "../../stores/streaming.ts";
import { subscribeToContent } from "../../lib/streaming-buffer.ts";
import { useAutoScroll } from "../../hooks/useAutoScroll.ts";
import MessageItem from "./MessageItem.tsx";

interface MessageListProps {
  activePath: ActivePath | null;
  speakerMap: Map<string, Speaker>;
  nodeMap: Map<string, ChatNode>;
  chatId: string;
  userName: string;
}

/**
 * Estimated height (px) for a message row.
 * TanStack Virtual uses this for offscreen items until they're measured.
 */
const ESTIMATED_ITEM_SIZE = 72;

/** Stable reference — always returns the same constant. */
const estimateSize = () => ESTIMATED_ITEM_SIZE;

/** Stable style for the scroll container. */
const scrollContainerStyle: React.CSSProperties = {
  height: "100%",
  overflowY: "auto",
  contain: "strict",
};

/** Stable base style for absolutely-positioned virtual items. */
const virtualItemBaseStyle: React.CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  width: "100%",
};

const MessageList = React.memo(function MessageList({
  activePath,
  speakerMap,
  nodeMap,
  chatId,
  userName,
}: MessageListProps) {
  const isStreaming = useIsStreaming();
  const nodes = activePath?.nodes ?? [];

  // ── Auto-scroll (intent-aware) ──────────────────────────────────────
  const { scrollRef, onScroll, scrollToBottom, forceScrollToBottom, onContentGrow } =
    useAutoScroll();

  // ── Stable getScrollElement for virtualizer ─────────────────────────
  const getScrollElement = useCallback(() => scrollRef.current, [scrollRef]);

  // ── Pre-compute sibling info ────────────────────────────────────────
  const siblingInfos = useMemo(() => {
    return nodes.map((node) => getSiblingInfo(node.id, nodeMap));
  }, [nodes, nodeMap]);

  // ── Virtualizer ─────────────────────────────────────────────────────
  // No special ethereal slot — the streaming node is a real node in the
  // active path (optimistically inserted by useStreamSocket).
  const virtualizer = useVirtualizer({
    count: nodes.length,
    getScrollElement,
    estimateSize,
    overscan: 5,
  });

  // ── Measure callback for dynamic heights ────────────────────────────
  const measureRef = useCallback(
    (node: HTMLElement | null) => {
      if (node) {
        virtualizer.measureElement(node);
      }
    },
    [virtualizer],
  );

  // ── Scroll to bottom on initial load and when new messages arrive ────
  const prevCountRef = useRef(0);
  const initialScrollDoneRef = useRef(false);

  // Scroll to the last item using the virtualizer (reliable with estimated sizes).
  const scrollToLastItem = useCallback(() => {
    if (nodes.length === 0) return;
    virtualizer.scrollToIndex(nodes.length - 1, { align: "end" });
    // After the virtualizer scrolls and measures, do a second pass to ensure
    // we're truly at the bottom (first scroll uses estimated size, second uses measured).
    requestAnimationFrame(() => {
      virtualizer.scrollToIndex(nodes.length - 1, { align: "end" });
      // Re-engage sticky after programmatic scroll
      forceScrollToBottom();
    });
  }, [nodes.length, virtualizer, forceScrollToBottom]);

  useEffect(() => {
    if (nodes.length > 0 && !initialScrollDoneRef.current) {
      // First time we have content — scroll to the last message.
      initialScrollDoneRef.current = true;
      // Defer so the virtualizer has laid out at least the estimated items.
      requestAnimationFrame(() => scrollToLastItem());
    } else if (nodes.length > prevCountRef.current && prevCountRef.current > 0) {
      // Subsequent new message — scroll if sticky
      requestAnimationFrame(() => scrollToBottom());
    }
    prevCountRef.current = nodes.length;
  }, [nodes.length, scrollToBottom, scrollToLastItem]);

  // Reset initial scroll flag when chat changes
  const prevChatIdRef = useRef(chatId);
  useEffect(() => {
    if (chatId !== prevChatIdRef.current) {
      initialScrollDoneRef.current = false;
      prevCountRef.current = 0;
      prevChatIdRef.current = chatId;
    }
  }, [chatId]);

  // ── During streaming: keep scroll pinned as content grows ───────────
  useEffect(() => {
    if (!isStreaming) return;

    const unsub = subscribeToContent(() => {
      onContentGrow();
    });

    return unsub;
  }, [isStreaming, onContentGrow]);

  // ── When streaming starts, force scroll to bottom ───────────────────
  const wasStreamingRef = useRef(false);
  useEffect(() => {
    if (isStreaming && !wasStreamingRef.current) {
      forceScrollToBottom();
    }
    wasStreamingRef.current = isStreaming;
  }, [isStreaming, forceScrollToBottom]);

  // ── Render ──────────────────────────────────────────────────────────
  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      style={scrollContainerStyle}
    >
      <div className="mx-auto w-[60vw] relative"
        style={{
          height: virtualizer.getTotalSize(),
        }}
      >
        {virtualItems.map((virtualItem) => {
          const node = nodes[virtualItem.index]!;
          const prevNode =
            virtualItem.index > 0
              ? nodes[virtualItem.index - 1]
              : undefined;
          const isFirstInGroup =
            !prevNode || prevNode.speaker_id !== node.speaker_id;
          const isLast = virtualItem.index === nodes.length - 1;

          return (
            <div
              key={node.id}
              data-index={virtualItem.index}
              ref={measureRef}
              style={{
                ...virtualItemBaseStyle,
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <MessageItem
                node={node}
                speaker={speakerMap.get(node.speaker_id)}
                siblingInfo={siblingInfos[virtualItem.index] ?? null}
                chatId={chatId}
                isFirstInGroup={isFirstInGroup}
                isLast={isLast}
                userName={userName}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
});

export default MessageList;
