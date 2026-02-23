import React from "react";
import { Avatar } from "../../components/ui/avatar.tsx";
import MessageMeta from "../../components/chat/MessageMeta.tsx";
import MessageContent from "./MessageContent.tsx";
import MessageBranch from "../../components/chat/MessageBranch.tsx";
import MessageActions from "../../components/chat/MessageActions.tsx";
import type { MessageItemLayoutProps } from "../../components/chat/message-item/types.ts";
import { useIsStreaming } from "../../stores/streaming.ts";
import { RefreshCcw } from "lucide-react";

function RegenerateButton({ onRegenerate }: { onRegenerate: () => void }) {
  const isStreamingGlobal = useIsStreaming();
  if (isStreamingGlobal) return null;

  return (
    <button
      type="button"
      onClick={onRegenerate}
      className="mt-1.5 flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-text-dim hover:text-text-body hover:bg-surface-hover transition-colors duration-150 cursor-pointer"
    >
      <RefreshCcw
        width="14"
        height="14"
        className="text-[var(--color-background-elevated)]"
      />
      Regenerate
    </button>
  );
}

export default function ChubMessageItem({
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
      className={`w-full sm:max-w-[59vw] mx-auto relative flex flex-row gap-[0.7rem] transition-colors duration-150 bg-neutral-800/50 my-[0.1rem] rounded-sm ${
        isFirstInGroup ? "pt-[0.8rem] pb-[0.15rem] px-2.5 sm:px-4" : "py-[0.15rem] px-2 sm:px-4"
      }`}
    >
      {/* Avatar column */}
      <div
        className={`w-[var(--chat-avatar-column-width-active)] min-w-[var(--chat-avatar-column-width-active)] flex justify-center self-start ${
          isFirstInGroup ? "pt-[2px]" : "pt-0"
        }`}
      >
        {isFirstInGroup && speaker && (
          speaker.avatar_url ? (
            <Avatar
              src={speaker.avatar_url}
              alt={speaker.name}
              borderRadius="0.5rem"
              width={'var(--chat-avatar-column-width-active)'}
              fit="natural"
            />
          ) : (
            <div
              className="w-[var(--chat-avatar-column-width-active)] h-[var(--chat-avatar-column-width-active)] rounded-full flex items-center justify-center text-[0.8rem] font-semibold text-white shrink-0"
              style={{ background: speaker.color ?? "#333" /* intentionally dynamic */ }}
            >
              {speaker.name.charAt(0).toUpperCase()}
            </div>
          )
        )}
      </div>

      {/* Content column */}
      <div className="flex-1 min-w-0 pr-[0.5rem]">
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
