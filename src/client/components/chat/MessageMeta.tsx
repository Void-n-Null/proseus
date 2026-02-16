import React from "react";
import type { Speaker } from "../../../shared/types.ts";

interface MessageMetaProps {
  speaker: Speaker;
  createdAt: number;
  updatedAt: number | null;
}

function formatSmartTimestamp(epochMs: number): string {
  const now = Date.now();
  const diffMs = now - epochMs;
  const diffSeconds = Math.floor(diffMs / 1000);

  if (diffSeconds < 60) return "just now";

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const date = new Date(epochMs);
  const month = date.toLocaleString("en", { month: "short" });
  const day = date.getDate();
  return `${month} ${day}`;
}

const MessageMeta = React.memo(function MessageMeta({
  speaker,
  createdAt,
  updatedAt,
}: MessageMetaProps) {
  return (
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
          color: speaker.color ?? "#e0e0e0",
        }}
      >
        {speaker.name}
      </span>
      <span style={{ fontSize: "0.7rem", color: "#555" }}>
        {formatSmartTimestamp(createdAt)}
      </span>
      {updatedAt !== null && (
        <span style={{ fontSize: "0.65rem", color: "#4a4a4a", fontStyle: "italic" }}>
          (edited)
        </span>
      )}
    </div>
  );
});

export default MessageMeta;
