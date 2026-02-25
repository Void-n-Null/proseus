import React, { useCallback, useEffect, useRef, useMemo } from "react";
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
  /** Current edit draft — managed by the shared MessageItem wrapper. */
  editDraft: string;
  /** Called on every keystroke while editing. */
  onEditDraftChange: (value: string) => void;
  onEditSubmit: () => void;
  onEditCancel: () => void;
}

/** Replace {{user}} placeholders (case-insensitive) with the active persona name. */
function applyUserPlaceholder(content: string, userName: string): string {
  return content.replace(/\{\{user\}\}/gi, userName);
}

const contentClass =
  "text-[length:var(--chat-message-text-size-mobile)] sm:text-[length:var(--chat-message-text-size)] [font-family:var(--chat-message-font-family,var(--font-body))] leading-[1.5] text-text-body break-words";

const MessageContent = React.memo(function MessageContent({
  message,
  isEditing,
  isStreaming,
  speakerColor,
  userName,
  editDraft,
  onEditDraftChange,
  onEditSubmit,
  onEditCancel,
}: MessageContentProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const streamContentRef = useRef<HTMLDivElement>(null);

  // Auto-focus and auto-size the textarea when entering edit mode
  useEffect(() => {
    if (isEditing) {
      requestAnimationFrame(() => {
        const ta = textareaRef.current;
        if (ta) {
          ta.focus();
          // Auto-size to fit content
          ta.style.height = "auto";
          ta.style.height = `${ta.scrollHeight}px`;
        }
      });
    }
  }, [isEditing]);

  // Auto-resize textarea as content changes
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onEditDraftChange(e.target.value);
      // Auto-size
      const ta = e.target;
      ta.style.height = "auto";
      ta.style.height = `${ta.scrollHeight}px`;
    },
    [onEditDraftChange],
  );

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

  const renderedHtml = useMemo(
    () => renderMarkdown(applyUserPlaceholder(message, userName)),
    [message, userName],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        onEditSubmit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onEditCancel();
      }
    },
    [onEditSubmit, onEditCancel],
  );

  if (isEditing) {
    return (
      <textarea
        ref={textareaRef}
        value={editDraft}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        className={`${contentClass} w-full bg-transparent border-none outline-none resize-none p-0 m-0 whitespace-pre-wrap`}
        rows={1}
      />
    );
  }

  if (isStreaming) {
    return (
      <div
        className={`message-content ${contentClass}`}
        /* intentionally dynamic: padding & line-height from design-template CSS vars */
        style={{
          padding: 'var(--chat-streaming-padding)',
          lineHeight: 'var(--chat-streaming-line-height)',
        }}
      >
        <div ref={streamContentRef} />
        <span
          className="streaming-cursor inline-block w-[2px] h-[1em] ml-px align-text-bottom animate-[etherealCursor_1s_step-end_infinite]"
          style={{ background: speakerColor ?? "#888" /* intentionally dynamic */ }}
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

  return (
    <div
      className={`message-content ${contentClass}`}
      dangerouslySetInnerHTML={{ __html: renderedHtml }}
    />
  );
});

export default MessageContent;
