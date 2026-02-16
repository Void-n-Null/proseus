import React, { useState, useCallback, useEffect, useRef } from "react";
import { subscribeToContent } from "../../lib/streaming-buffer.ts";

interface MessageContentProps {
  message: string;
  isEditing: boolean;
  isStreaming: boolean;
  speakerColor?: string | null;
  onEditSubmit: (msg: string) => void;
  onEditCancel: () => void;
}

/** Stable style for the content display container. */
const contentStyle: React.CSSProperties = {
  fontSize: "0.9rem",
  lineHeight: 1.55,
  color: "#ddd",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

const MessageContent = React.memo(function MessageContent({
  message,
  isEditing,
  isStreaming,
  speakerColor,
  onEditSubmit,
  onEditCancel,
}: MessageContentProps) {
  const [draft, setDraft] = useState(message);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const streamContentRef = useRef<HTMLSpanElement>(null);

  // Reset draft when entering edit mode
  useEffect(() => {
    if (isEditing) {
      setDraft(message);
      // Focus textarea after render
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
      });
    }
  }, [isEditing, message]);

  // ── Streaming mode: subscribe to buffer, write directly to DOM ──
  useEffect(() => {
    if (!isStreaming) return;

    const unsub = subscribeToContent((content) => {
      if (streamContentRef.current) {
        streamContentRef.current.textContent = content;
      }
    });
    return unsub;
  }, [isStreaming]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        onEditSubmit(draft);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onEditCancel();
      }
    },
    [draft, onEditSubmit, onEditCancel],
  );

  if (isEditing) {
    return (
      <div>
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          style={{
            width: "100%",
            minHeight: "3rem",
            padding: "0.5rem",
            background: "#1a1a1a",
            color: "#e0e0e0",
            border: "1px solid #333",
            borderRadius: "4px",
            fontFamily: "inherit",
            fontSize: "0.9rem",
            lineHeight: 1.5,
            resize: "vertical",
            outline: "none",
            boxSizing: "border-box",
          }}
        />
        <div
          style={{
            display: "flex",
            gap: "0.4rem",
            marginTop: "0.3rem",
          }}
        >
          <button
            onClick={() => onEditSubmit(draft)}
            style={{
              padding: "0.25rem 0.6rem",
              background: "#2563eb",
              color: "#fff",
              border: "none",
              borderRadius: "3px",
              cursor: "pointer",
              fontSize: "0.75rem",
            }}
          >
            Save
          </button>
          <button
            onClick={onEditCancel}
            style={{
              padding: "0.25rem 0.6rem",
              background: "transparent",
              color: "#888",
              border: "1px solid #333",
              borderRadius: "3px",
              cursor: "pointer",
              fontSize: "0.75rem",
            }}
          >
            Cancel
          </button>
          <span style={{ fontSize: "0.65rem", color: "#555", alignSelf: "center" }}>
            Ctrl+Enter to save, Esc to cancel
          </span>
        </div>
      </div>
    );
  }

  // ── Streaming mode: ref-based content with blinking cursor ──
  if (isStreaming) {
    return (
      <div style={contentStyle}>
        <span ref={streamContentRef} />
        <span
          style={{
            display: "inline-block",
            width: "2px",
            height: "1em",
            background: speakerColor ?? "#888",
            marginLeft: "1px",
            verticalAlign: "text-bottom",
            animation: "etherealCursor 1s step-end infinite",
          }}
        />
        <style>{`
          @keyframes etherealCursor {
            0%, 50% { opacity: 1; }
            51%, 100% { opacity: 0; }
          }
        `}</style>
      </div>
    );
  }

  // ── Normal mode: render persisted message ──
  return (
    <div style={contentStyle}>
      {message}
    </div>
  );
});

export default MessageContent;
