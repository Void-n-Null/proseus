import React, { useRef, useMemo } from "react";
import type { ActivePath, ChatNode, Speaker } from "../../../shared/types.ts";
import { getSiblingInfo } from "../../../shared/tree.ts";
import { useIsStreaming } from "../../stores/streaming.ts";
import MessageItem from "./MessageItem.tsx";
import EtherealMessage from "./EtherealMessage.tsx";
import ScrollAnchor from "../ui/ScrollAnchor.tsx";

interface MessageListProps {
  activePath: ActivePath | null;
  speakerMap: Map<string, Speaker>;
  nodeMap: Map<string, ChatNode>;
  chatId: string;
}

export default function MessageList({
  activePath,
  speakerMap,
  nodeMap,
  chatId,
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isStreaming = useIsStreaming();

  const nodes = activePath?.nodes ?? [];

  // Pre-compute sibling info for each node in the active path.
  // This moves the nodeMap dependency out of MessageItem so its
  // memo comparator can work with simple value types.
  const siblingInfos = useMemo(() => {
    return nodes.map((node) => getSiblingInfo(node.id, nodeMap));
  }, [nodes, nodeMap]);

  return (
    <div
      ref={scrollRef}
      style={{
        height: "100%",
        overflowY: "auto",
        padding: "0.5rem 0",
      }}
    >
      {nodes.map((node, index) => {
        const prevNode = index > 0 ? nodes[index - 1] : undefined;
        const isFirstInGroup =
          !prevNode || prevNode.speaker_id !== node.speaker_id;
        const isLast = index === nodes.length - 1;

        return (
          <MessageItem
            key={node.id}
            node={node}
            speaker={speakerMap.get(node.speaker_id)}
            siblingInfo={siblingInfos[index] ?? null}
            chatId={chatId}
            isFirstInGroup={isFirstInGroup}
            isLast={isLast}
          />
        );
      })}

      {isStreaming && <EtherealMessage speakerMap={speakerMap} />}

      <ScrollAnchor
        containerRef={scrollRef}
        deps={[nodes.length, isStreaming]}
      />
    </div>
  );
}
