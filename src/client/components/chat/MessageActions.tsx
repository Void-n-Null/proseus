import React, { useCallback } from "react";
import type { ChatNode } from "../../../shared/types.ts";
import { useChatMutations } from "../../hooks/useMutations.ts";

interface MessageActionsProps {
  node: ChatNode;
  chatId: string;
  onStartEdit: () => void;
  isVisible: boolean;
}

export default function MessageActions({
  node,
  chatId,
  onStartEdit,
  isVisible,
}: MessageActionsProps) {
  const { deleteMessage } = useChatMutations(chatId);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(node.message).catch(() => {
      // Silently fail if clipboard not available
    });
  }, [node.message]);

  const handleDelete = useCallback(() => {
    const confirmed = window.confirm(
      "Delete this message and all its descendants?",
    );
    if (confirmed) {
      deleteMessage.mutate(node.id);
    }
  }, [deleteMessage, node.id]);

  if (!isVisible) return null;

  const buttonStyle: React.CSSProperties = {
    padding: "0.2rem 0.45rem",
    background: "#1a1a1a",
    color: "#999",
    border: "1px solid #2a2a2a",
    borderRadius: "3px",
    cursor: "pointer",
    fontSize: "0.7rem",
    lineHeight: 1,
    whiteSpace: "nowrap",
  };

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        right: "1rem",
        display: "flex",
        gap: "0.2rem",
        padding: "0.2rem",
        background: "#0e0e0e",
        border: "1px solid #222",
        borderRadius: "4px",
        zIndex: 10,
      }}
    >
      <button onClick={onStartEdit} style={buttonStyle}>
        Edit
      </button>
      <button onClick={handleCopy} style={buttonStyle}>
        Copy
      </button>
      <button
        onClick={handleDelete}
        style={{ ...buttonStyle, color: "#c44" }}
      >
        Delete
      </button>
    </div>
  );
}
