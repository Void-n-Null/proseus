import React from "react";
import { Avatar } from "../../components/ui/avatar.tsx";
import MessageContent from "../forge/MessageContent.tsx";
import MessageBranch from "../../components/chat/MessageBranch.tsx";
import type { MessageItemLayoutProps } from "../../components/chat/message-item/types.ts";
import DateDivider from "./DateDivider.tsx";
import ChatBeginningBlock from "./ChatBeginningBlock.tsx";

function formatDiscordTime(epochMs: number): string {
  const date = new Date(epochMs);
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  const h = hours % 12 || 12;
  const m = minutes.toString().padStart(2, "0");
  return `${h}:${m} ${ampm}`;
}

export default function DiscordMessageItem({
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
  dateDividerDate,
  isFirstMessage,
  characterName,
  characterAvatarUrl,
}: MessageItemLayoutProps) {
  return (
    <>
      {/* Beginning-of-conversation block — only on the very first message */}
      {isFirstMessage && (
        <ChatBeginningBlock
          characterName={characterName ?? null}
          characterAvatarUrl={characterAvatarUrl ?? null}
        />
      )}

      {/* Date divider — shown when the day changes between messages */}
      {dateDividerDate != null && (
        <DateDivider date={dateDividerDate} />
      )}

    <div
        className={[
          "relative flex flex-row gap-4 transition-colors duration-100",
          isFirstInGroup
            ? "mt-[1.0625rem] pt-[0.125rem] pb-[0.125rem] pl-14 pr-3 sm:pl-[4.5rem] sm:pr-12"
            : "py-[0.125rem] pl-14 pr-3 sm:pl-[4.5rem] sm:pr-12",
          isHovered
            ? "bg-[#2a2a2e]/50"
            : "bg-transparent",
        ].join(" ")}
        style={{ fontFamily: "var(--discord-font)" }}
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
        <span className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 w-8 sm:w-10 text-center text-[0.625rem] text-[#b9bbbe] select-none">
          {formatDiscordTime(node.created_at)}
        </span>
      )}

      {/* Content column */}
      <div className="flex-1 min-w-0 [&_.message-content]:text-[#dcddde] [&_.message-content]:leading-[22px]">
        {/* Header: name + timestamp on first in group */}
        {isFirstInGroup && speaker && (
          <div className="flex items-baseline gap-2 mb-[0.125rem]">
            <span className="font-medium text-[1rem] leading-[1.375rem] text-white">
              {speaker.name}
            </span>
            <span className="text-[0.75rem] text-[#b9bbbe] leading-[1.375rem]">
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
    </>
  );
}
