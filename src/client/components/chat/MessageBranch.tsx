import React, { useMemo, useCallback } from "react";
import type { ChatNode } from "../../../shared/types.ts";
import { getSiblingInfo } from "../../../shared/tree.ts";
import { useChatMutations } from "../../hooks/useMutations.ts";

interface MessageBranchProps {
  nodeId: string;
  nodeMap: Map<string, ChatNode>;
  chatId: string;
}

export default function MessageBranch({
  nodeId,
  nodeMap,
  chatId,
}: MessageBranchProps) {
  const siblingInfo = useMemo(
    () => getSiblingInfo(nodeId, nodeMap),
    [nodeId, nodeMap],
  );

  const { swipeSibling } = useChatMutations(chatId);

  const handlePrev = useCallback(() => {
    // Swipe endpoint takes the current node's id
    swipeSibling.mutate({ nodeId, direction: "prev" });
  }, [swipeSibling, nodeId]);

  const handleNext = useCallback(() => {
    swipeSibling.mutate({ nodeId, direction: "next" });
  }, [swipeSibling, nodeId]);

  // Only render if there are siblings
  if (!siblingInfo || siblingInfo.total <= 1) return null;

  const atStart = siblingInfo.index === 0;
  const atEnd = siblingInfo.index === siblingInfo.total - 1;

  const arrowStyle = (disabled: boolean): React.CSSProperties => ({
    background: "none",
    border: "none",
    color: disabled ? "#333" : "#777",
    cursor: disabled ? "default" : "pointer",
    padding: "0 0.25rem",
    fontSize: "0.8rem",
    fontWeight: 700,
    lineHeight: 1,
  });

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.15rem",
        marginTop: "0.25rem",
        fontSize: "0.7rem",
        color: "#666",
        userSelect: "none",
      }}
    >
      <button
        onClick={handlePrev}
        disabled={atStart}
        style={arrowStyle(atStart)}
        aria-label="Previous sibling"
      >
        &larr;
      </button>
      <span style={{ minWidth: "2rem", textAlign: "center" }}>
        {siblingInfo.index + 1}/{siblingInfo.total}
      </span>
      <button
        onClick={handleNext}
        disabled={atEnd}
        style={arrowStyle(atEnd)}
        aria-label="Next sibling"
      >
        &rarr;
      </button>
    </div>
  );
}
