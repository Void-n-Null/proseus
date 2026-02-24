import React from "react";
import { Avatar } from "../../components/ui/avatar.tsx";
import MessageMeta from "../../components/chat/MessageMeta.tsx";
import MessageContent from "./MessageContent.tsx";
import MessageBranch from "../../components/chat/MessageBranch.tsx";
import type { MessageItemLayoutProps } from "../../components/chat/message-item/types.ts";
import { useIsMobile } from "../../hooks/useMediaQuery.ts";

export default function ForgeMessageItem({
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
  editDraft,
  onEditDraftChange,
  handleEditSubmit,
  handleEditCancel,
}: MessageItemLayoutProps) {
  const isMobile = useIsMobile();
  return (
    <div
      className={`relative flex flex-row gap-[var(--chat-message-row-gap)] transition-colors duration-150 ${
        isFirstInGroup
          ? "pt-[var(--chat-message-group-start-pt)] pb-[0.15rem] px-2.5 sm:px-4"
          : "py-[0.15rem] px-[var(--chat-message-px)] sm:px-4"
      }`}
      /* intentionally dynamic: max-width, margin, border-radius, background from design-template CSS vars */
      style={{
        maxWidth: isMobile ? 'var(--chat-message-max-width-mobile)' : 'var(--chat-message-max-width)',
        margin: '0 auto',
        marginTop: 'var(--chat-message-margin-t)',
        marginBottom: 'var(--chat-message-margin-b)',
        borderRadius: 'var(--chat-message-border-radius)',
        padding: 'var(--chat-message-padding)',
        background: isHovered
          ? 'var(--chat-message-bg-hover)'
          : 'var(--chat-message-bg)',
      }}
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
              borderRadius="var(--chat-avatar-border-radius)"
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
      <div className="flex-1 min-w-0 pr-[var(--chat-message-content-pr)]">
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
            editDraft={editDraft}
            onEditDraftChange={onEditDraftChange}
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

      </div>
    </div>
  );
}
