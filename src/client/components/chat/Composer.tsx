import React, { useState, useCallback, useRef, useMemo } from "react";
import type { ActivePath, Speaker } from "../../../shared/types.ts";
import { useIsStreaming } from "../../stores/streaming.ts";
import { useChatMutations } from "../../hooks/useMutations.ts";

interface ComposerProps {
  chatId: string;
  activePath: ActivePath | null;
  speakerMap: Map<string, Speaker>;
}

export default function Composer({
  chatId,
  activePath,
  speakerMap,
}: ComposerProps) {
  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isStreaming = useIsStreaming();
  const { addMessage } = useChatMutations(chatId);

  const userSpeaker = useMemo(() => {
    for (const speaker of speakerMap.values()) {
      if (speaker.is_user) return speaker;
    }
    return undefined;
  }, [speakerMap]);

  const lastNodeId =
    activePath && activePath.node_ids.length > 0
      ? activePath.node_ids[activePath.node_ids.length - 1]
      : null;

  const canSend =
    draft.trim().length > 0 && lastNodeId !== null && userSpeaker !== undefined;

  const handleSend = useCallback(() => {
    if (!canSend || !lastNodeId || !userSpeaker) return;

    addMessage.mutate({
      parent_id: lastNodeId,
      speaker_id: userSpeaker.id,
      is_bot: false,
      message: draft.trim(),
    });

    setDraft("");

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [canSend, lastNodeId, userSpeaker, draft, addMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setDraft(e.target.value);

      // Auto-resize textarea
      const el = e.target;
      el.style.height = "auto";
      const maxHeight = parseFloat(getComputedStyle(el).lineHeight) * 6 || 144;
      el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
    },
    [],
  );

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        gap: "0.5rem",
        padding: "0.6rem 1rem",
        background: "#0d0d0d",
        borderTop: "1px solid #1a1a1a",
        flexShrink: 0,
      }}
    >
      <textarea
        ref={textareaRef}
        value={draft}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        disabled={isStreaming}
        placeholder={isStreaming ? "Generating..." : "Type a message..."}
        rows={1}
        style={{
          flex: 1,
          padding: "0.5rem 0.7rem",
          background: "#151515",
          color: "#e0e0e0",
          border: "1px solid #2a2a2a",
          borderRadius: "8px",
          fontFamily: "inherit",
          fontSize: "0.9rem",
          lineHeight: "1.4",
          resize: "none",
          outline: "none",
          overflow: "hidden",
          boxSizing: "border-box",
          opacity: isStreaming ? 0.5 : 1,
        }}
      />

      {isStreaming ? (
        <button
          style={{
            padding: "0.5rem 1rem",
            background: "#7f1d1d",
            color: "#fca5a5",
            border: "none",
            borderRadius: "8px",
            cursor: "pointer",
            fontSize: "0.85rem",
            fontWeight: 500,
            flexShrink: 0,
          }}
        >
          Stop
        </button>
      ) : (
        <button
          onClick={handleSend}
          disabled={!canSend}
          style={{
            padding: "0.5rem 1rem",
            background: canSend ? "#2563eb" : "#1a1a1a",
            color: canSend ? "#fff" : "#555",
            border: "none",
            borderRadius: "8px",
            cursor: canSend ? "pointer" : "default",
            fontSize: "0.85rem",
            fontWeight: 500,
            flexShrink: 0,
          }}
        >
          Send
        </button>
      )}
    </div>
  );
}
