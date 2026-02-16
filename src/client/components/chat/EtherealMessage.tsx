import React, { useRef, useEffect } from "react";
import type { Speaker } from "../../../shared/types.ts";
import { useIsStreaming, useStreamingMeta } from "../../stores/streaming.ts";
import { subscribeToContent } from "../../lib/streaming-buffer.ts";

interface EtherealMessageProps {
  speakerMap: Map<string, Speaker>;
}

export default function EtherealMessage({ speakerMap }: EtherealMessageProps) {
  const isStreaming = useIsStreaming();
  const meta = useStreamingMeta();
  const contentRef = useRef<HTMLDivElement>(null);

  // Subscribe to streaming content updates — direct DOM writes, zero re-renders
  useEffect(() => {
    const unsub = subscribeToContent((content) => {
      if (contentRef.current) {
        contentRef.current.textContent = content;
      }
    });
    return unsub;
  }, []);

  if (!isStreaming || !meta) return null;

  const speaker = speakerMap.get(meta.speakerId);
  const speakerName = speaker?.name ?? "AI";
  const speakerColor = speaker?.color ?? "#888";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        padding: "0.5rem 1rem",
        gap: "0.6rem",
      }}
    >
      {/* Avatar */}
      <div
        style={{
          width: 36,
          minWidth: 36,
          display: "flex",
          justifyContent: "center",
          paddingTop: 2,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: speakerColor,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "0.8rem",
            fontWeight: 600,
            color: "#fff",
          }}
        >
          {speakerName.charAt(0).toUpperCase()}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: "0.4rem",
            marginBottom: "0.15rem",
          }}
        >
          <span
            style={{
              fontWeight: 600,
              fontSize: "0.85rem",
              color: speakerColor,
            }}
          >
            {speakerName}
          </span>
          <span style={{ fontSize: "0.7rem", color: "#555" }}>
            typing...
          </span>
        </div>

        <div
          style={{
            fontSize: "0.9rem",
            lineHeight: 1.55,
            color: "#ddd",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          <span ref={contentRef} />
          <span
            style={{
              display: "inline-block",
              width: "2px",
              height: "1em",
              background: speakerColor,
              marginLeft: "1px",
              verticalAlign: "text-bottom",
              animation: "etherealCursor 1s step-end infinite",
            }}
          />
        </div>
      </div>

      {/* Cursor blink animation */}
      <style>{`
        @keyframes etherealCursor {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
