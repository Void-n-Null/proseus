import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { subscribeToContent } from "../../lib/streaming-buffer.ts";
import {
  renderMarkdown,
  renderStreamingMarkdown,
} from "../../lib/markdown.ts";

interface MessageContentProps {
  message: string;
  isEditing: boolean;
  isStreaming: boolean;
  speakerColor?: string | null;
  userName: string;
  onEditSubmit: (msg: string) => void;
  onEditCancel: () => void;
}

/** Replace {{user}} placeholders (case-insensitive) with the active persona name. */
function applyUserPlaceholder(content: string, userName: string): string {
  return content.replace(/\{\{user\}\}/gi, userName);
}

/** Stable style for the content display container. */
const contentStyle: React.CSSProperties = {
  fontSize: "1rem",
  fontFamily: "sans-serif",
  lineHeight: 1.5,
  color: "#ddd",
  wordBreak: "break-word",
};

const MessageContent = React.memo(function MessageContent({
  message,
  isEditing,
  isStreaming,
  speakerColor,
  userName,
  onEditSubmit,
  onEditCancel,
}: MessageContentProps) {
  const [draft, setDraft] = useState(message);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const streamContentRef = useRef<HTMLDivElement>(null);

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
        streamContentRef.current.innerHTML = renderStreamingMarkdown(
          applyUserPlaceholder(content, userName),
        );
      }
    });
    return unsub;
  }, [isStreaming, userName]);

  // ── Memoize rendered markdown for normal mode ──
  const renderedHtml = useMemo(
    () => renderMarkdown(applyUserPlaceholder(message, userName)),
    [message, userName],
  );

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
      <div className="message-content" style={contentStyle}>
        <div ref={streamContentRef} />
        <span
          className="streaming-cursor"
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

  // ── Normal mode: render persisted message as markdown ──
  return (
    <div
      className="message-content"
      style={contentStyle}
      dangerouslySetInnerHTML={{ __html: renderedHtml }}
    />
  );
});

export default MessageContent;
