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

  const btnClass =
    "py-[0.2rem] px-[0.45rem] bg-[#1a1a1a] text-[#999] border border-[#2a2a2a] rounded-[3px] cursor-pointer text-[0.7rem] leading-none whitespace-nowrap";

  return (
    <div className="absolute top-0 right-4 flex gap-[0.2rem] p-[0.2rem] bg-[#0e0e0e] border border-[#222] rounded-[4px] z-10">
      <button onClick={onStartEdit} className={btnClass}>
        Edit
      </button>
      <button onClick={handleCopy} className={btnClass}>
        Copy
      </button>
      <button
        onClick={handleDelete}
        className={`${btnClass} text-[#c44]!`}
      >
        Delete
      </button>
    </div>
  );
}
