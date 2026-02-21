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
    <div className="flex items-baseline gap-[0.4rem] mb-[0.15rem]">
      <span
        className="font-semibold text-[1.1rem]"
        style={{ color: speaker.color ?? "#e0e0e0" /* intentionally dynamic */ }}
      >
        {speaker.name}
      </span>
      <span className="text-[0.7rem] text-[#555]">
        {formatSmartTimestamp(createdAt)}
      </span>
      {updatedAt !== null && (
        <span className="text-[0.65rem] text-[#4a4a4a] italic">
          (edited)
        </span>
      )}
    </div>
  );
});

export default MessageMeta;
