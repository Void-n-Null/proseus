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

const estimateSize = () => ESTIMATED_ITEM_SIZE;

const MessageList = React.memo(function MessageList({
  activePath,
  speakerMap,
  nodeMap,
  chatId,
  userName,
}: MessageListProps) {
  const isStreaming = useIsStreaming();
  const nodes = activePath?.nodes ?? [];

  const { scrollRef, onScroll, scrollToBottom, forceScrollToBottom, onContentGrow } =
    useAutoScroll();

  const getScrollElement = useCallback(() => scrollRef.current, [scrollRef]);

  const siblingInfos = useMemo(() => {
    return nodes.map((node) => getSiblingInfo(node.id, nodeMap));
  }, [nodes, nodeMap]);

  const virtualizer = useVirtualizer({
    count: nodes.length,
    getScrollElement,
    estimateSize,
    overscan: 5,
  });

  const measureRef = useCallback(
    (node: HTMLElement | null) => {
      if (node) {
        virtualizer.measureElement(node);
      }
    },
    [virtualizer],
  );

  const prevCountRef = useRef(0);
  const initialScrollDoneRef = useRef(false);

  const scrollToLastItem = useCallback(() => {
    if (nodes.length === 0) return;
    virtualizer.scrollToIndex(nodes.length - 1, { align: "end" });
    requestAnimationFrame(() => {
      virtualizer.scrollToIndex(nodes.length - 1, { align: "end" });
      forceScrollToBottom();
    });
  }, [nodes.length, virtualizer, forceScrollToBottom]);

  useEffect(() => {
    if (nodes.length > 0 && !initialScrollDoneRef.current) {
      initialScrollDoneRef.current = true;
      requestAnimationFrame(() => scrollToLastItem());
    } else if (nodes.length > prevCountRef.current && prevCountRef.current > 0) {
      requestAnimationFrame(() => scrollToBottom());
    }
    prevCountRef.current = nodes.length;
  }, [nodes.length, scrollToBottom, scrollToLastItem]);

  const prevChatIdRef = useRef(chatId);
  useEffect(() => {
    if (chatId !== prevChatIdRef.current) {
      initialScrollDoneRef.current = false;
      prevCountRef.current = 0;
      prevChatIdRef.current = chatId;
    }
  }, [chatId]);

  useEffect(() => {
    if (!isStreaming) return;

    const unsub = subscribeToContent(() => {
      onContentGrow();
    });

    return unsub;
  }, [isStreaming, onContentGrow]);

  const wasStreamingRef = useRef(false);
  useEffect(() => {
    if (isStreaming && !wasStreamingRef.current) {
      forceScrollToBottom();
    }
    wasStreamingRef.current = isStreaming;
  }, [isStreaming, forceScrollToBottom]);

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="h-full overflow-y-auto [contain:strict]"
    >
      <div
        className="mx-auto w-[60vw] relative"
        style={{ height: virtualizer.getTotalSize() /* intentionally dynamic */ }}
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
              className="absolute top-0 left-0 w-full"
              style={{ transform: `translateY(${virtualItem.start}px)` /* intentionally dynamic */ }}
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
