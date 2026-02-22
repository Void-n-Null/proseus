import React from "react";
import { Avatar } from "../../ui/avatar.tsx";
import MessageMeta from "../MessageMeta.tsx";
import MessageContent from "../MessageContent.tsx";
import MessageBranch from "../MessageBranch.tsx";
import MessageActions from "../MessageActions.tsx";
import type { MessageItemLayoutProps } from "./types.ts";
import { useIsStreaming } from "../../../stores/streaming.ts";

function RegenerateButton({ onRegenerate }: { onRegenerate: () => void }) {
  const isStreamingGlobal = useIsStreaming();
  if (isStreamingGlobal) return null;

  return (
    <button
      type="button"
      onClick={onRegenerate}
      className="mt-1.5 flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-text-dim hover:text-text-body hover:bg-surface-hover transition-colors duration-150 cursor-pointer"
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

export default function ForgeMessageItemLayout({
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
      className={`relative flex flex-row gap-[0.6rem] transition-colors duration-150 ${
        isFirstInGroup ? "pt-2 pb-[0.15rem] px-2.5 sm:px-4" : "py-[0.15rem] px-2.5 sm:px-4"
      } ${isHovered ? "bg-surface-raised" : "bg-transparent"}`}
    >
      {/* Avatar column */}
      <div
        className={`w-9 min-w-9 sm:w-[50px] sm:min-w-[50px] flex justify-center self-start ${
          isFirstInGroup ? "pt-[2px]" : "pt-0"
        }`}
      >
        {isFirstInGroup && speaker && (
          speaker.avatar_url ? (
            <Avatar
              src={speaker.avatar_url}
              alt={speaker.name}
              width={50}
              fit="natural"
            />
          ) : (
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-[0.8rem] font-semibold text-white shrink-0"
              style={{ background: speaker.color ?? "#333" /* intentionally dynamic */ }}
            >
              {speaker.name.charAt(0).toUpperCase()}
            </div>
          )
        )}
      </div>

      {/* Content column */}
      <div className="flex-1 min-w-0">
        {isFirstInGroup && speaker && (
          <MessageMeta
            speaker={speaker}
            createdAt={node.created_at}
            updatedAt={node.updated_at}
          />
        )}

        <div className="pt-2">
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
