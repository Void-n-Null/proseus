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

const contentClass =
  "text-base font-sans leading-[1.5] text-[#ddd] break-words";

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

  useEffect(() => {
    if (isEditing) {
      setDraft(message);
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
      });
    }
  }, [isEditing, message]);

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
          className="w-full min-h-[3rem] p-2 bg-[#1a1a1a] text-[#e0e0e0] border border-[#333] rounded-[4px] font-[inherit] text-[0.9rem] leading-[1.5] resize-y outline-none box-border"
        />
        <div className="flex gap-[0.4rem] mt-[0.3rem]">
          <button
            onClick={() => onEditSubmit(draft)}
            className="py-[0.25rem] px-[0.6rem] bg-[#2563eb] text-white border-none rounded-[3px] cursor-pointer text-[0.75rem]"
          >
            Save
          </button>
          <button
            onClick={onEditCancel}
            className="py-[0.25rem] px-[0.6rem] bg-transparent text-[#888] border border-[#333] rounded-[3px] cursor-pointer text-[0.75rem]"
          >
            Cancel
          </button>
          <span className="text-[0.65rem] text-[#555] self-center">
            Ctrl+Enter to save, Esc to cancel
          </span>
        </div>
      </div>
    );
  }

  if (isStreaming) {
    return (
      <div className={`message-content ${contentClass}`}>
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
