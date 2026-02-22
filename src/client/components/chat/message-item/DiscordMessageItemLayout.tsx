import React from "react";
import { Avatar } from "../../ui/avatar.tsx";
import MessageContent from "../MessageContent.tsx";
import MessageBranch from "../MessageBranch.tsx";
import MessageActions from "../MessageActions.tsx";
import type { MessageItemLayoutProps } from "./types.ts";
import { useIsStreaming } from "../../../stores/streaming.ts";

function formatDiscordTime(epochMs: number): string {
  const date = new Date(epochMs);
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  const h = hours % 12 || 12;
  const m = minutes.toString().padStart(2, "0");
  return `${h}:${m} ${ampm}`;
}

function RegenerateButton({ onRegenerate }: { onRegenerate: () => void }) {
  const isStreamingGlobal = useIsStreaming();
  if (isStreamingGlobal) return null;

  return (
    <button
      type="button"
      onClick={onRegenerate}
      className="mt-1 flex items-center gap-1.5 px-2 py-0.5 rounded text-[0.75rem] text-[hsl(214_8%_62%)] hover:text-[hsl(214_10%_86%)] hover:bg-[hsl(228_6%_18%)] transition-colors duration-150 cursor-pointer"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
        <path d="M3 3v5h5" />
        <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
        <path d="M16 16h5v5" />
      </svg>
      Regenerate
    </button>
  );
}

export default function DiscordMessageItemLayout({
  node,
  speaker,
  siblingInfo,
  chatId,
  isFirstInGroup,
  isLast,
  userName,
  isHovered,
  isEditing,
  isStreaming,
  onRegenerate,
  onMouseEnter,
  onMouseLeave,
  handleEditSubmit,
  handleEditCancel,
  handleStartEdit,
}: MessageItemLayoutProps) {
  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
        className={[
          "relative flex flex-row gap-4 transition-colors duration-100",
          isFirstInGroup
            ? "mt-[1.0625rem] pt-[0.125rem] pb-[0.125rem] pl-14 pr-3 sm:pl-[4.5rem] sm:pr-12"
            : "py-[0.125rem] pl-14 pr-3 sm:pl-[4.5rem] sm:pr-12",
          isHovered
            ? "bg-[hsl(228_6%_13%_/_0.35)]"
            : "bg-transparent",
        ].join(" ")}
      >
      {/* Avatar — only on first message in group, positioned absolutely to left gutter */}
      {isFirstInGroup && speaker && (
        <div className="absolute left-2 sm:left-4 top-[0.125rem]">
          {speaker.avatar_url ? (
            <Avatar
              src={speaker.avatar_url}
              alt={speaker.name}
              size={40}
              fit="cover"
              borderRadius="50%"
            />
          ) : (
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-[0.85rem] font-semibold text-white shrink-0"
              style={{ background: speaker.color ?? "#5865F2" /* intentionally dynamic */ }}
            >
              {speaker.name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
      )}

      {/* Compact timestamp gutter for continuation messages */}
      {!isFirstInGroup && isHovered && (
        <span className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 w-8 sm:w-10 text-center text-[0.625rem] text-[hsl(214_8%_46%)] select-none">
          {formatDiscordTime(node.created_at)}
        </span>
      )}

      {/* Content column */}
      <div className="flex-1 min-w-0">
        {/* Header: name + timestamp on first in group */}
        {isFirstInGroup && speaker && (
          <div className="flex items-baseline gap-2 mb-[0.125rem]">
            <span
              className="font-medium text-[1rem] leading-[1.375rem]"
              style={{ color: speaker.color ?? "#f2f3f5" /* intentionally dynamic */ }}
            >
              {speaker.name}
            </span>
            <span className="text-[0.75rem] text-[hsl(214_8%_46%)] leading-[1.375rem]">
              {formatDiscordTime(node.created_at)}
            </span>
          </div>
        )}

        {/* Message body */}
        <div className={isFirstInGroup ? "" : ""}>
          <MessageContent
            message={node.message}
            isEditing={isEditing}
            isStreaming={isStreaming}
            speakerColor={speaker?.color}
            userName={userName}
            onEditSubmit={handleEditSubmit}
            onEditCancel={handleEditCancel}
          />
        </div>

        {!isStreaming && (
          <MessageBranch
            nodeId={node.id}
            siblingInfo={siblingInfo}
            chatId={chatId}
          />
        )}

        {isLast && speaker && !speaker.is_user && onRegenerate && (
          <RegenerateButton onRegenerate={onRegenerate} />
        )}
      </div>

      {/* Actions toolbar */}
      {!isStreaming && (
        <MessageActions
          node={node}
          chatId={chatId}
          onStartEdit={handleStartEdit}
          isVisible={isHovered && !isEditing}
        />
      )}
    </div>
  );
}
