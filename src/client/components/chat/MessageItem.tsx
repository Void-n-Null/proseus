import React, { useState, useCallback } from "react";
import type { ChatNode, Speaker } from "../../../shared/types.ts";
import { useIsStreamingNode, useIsStreaming } from "../../stores/streaming.ts";
import { useChatMutations } from "../../hooks/useMutations.ts";
import { Avatar } from "../ui/avatar.tsx";
import MessageMeta from "./MessageMeta.tsx";
import MessageContent from "./MessageContent.tsx";
import MessageBranch from "./MessageBranch.tsx";
import MessageActions from "./MessageActions.tsx";

interface MessageItemProps {
  node: ChatNode;
  speaker: Speaker | undefined;
  siblingInfo: { index: number; total: number } | null;
  chatId: string;
  isFirstInGroup: boolean;
  isLast: boolean;
  userName: string;
  onRegenerate?: () => void;
}

const MessageItem = React.memo(
  function MessageItem({
    node,
    speaker,
    siblingInfo,
    chatId,
    isFirstInGroup,
    isLast,
    userName,
    onRegenerate,
  }: MessageItemProps) {
    const [isHovered, setIsHovered] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const isStreaming = useIsStreamingNode(node.id);
    const { editMessage } = useChatMutations(chatId);

    const handleEditSubmit = useCallback(
      (message: string) => {
        editMessage.mutate({ nodeId: node.id, message });
        setIsEditing(false);
      },
      [editMessage, node.id],
    );

    const handleEditCancel = useCallback(() => {
      setIsEditing(false);
    }, []);

    const handleStartEdit = useCallback(() => {
      setIsEditing(true);
    }, []);

    return (
      <div
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`relative flex flex-row gap-[0.6rem] transition-colors duration-150 ${
          isFirstInGroup ? "pt-2 pb-[0.15rem] px-4" : "py-[0.15rem] px-4"
        } ${isHovered ? "bg-surface-raised" : "bg-transparent"}`}
      >
        {/* Avatar column */}
        <div
          className={`w-[50px] min-w-[50px] flex justify-center self-start ${
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
  },
  (prev, next) =>
    prev.node.id === next.node.id &&
    prev.node.message === next.node.message &&
    prev.node.updated_at === next.node.updated_at &&
    prev.isFirstInGroup === next.isFirstInGroup &&
    prev.isLast === next.isLast &&
    prev.siblingInfo?.index === next.siblingInfo?.index &&
    prev.siblingInfo?.total === next.siblingInfo?.total &&
    prev.speaker?.id === next.speaker?.id &&
    prev.speaker?.avatar_url === next.speaker?.avatar_url &&
    prev.speaker?.name === next.speaker?.name &&
    prev.userName === next.userName &&
    prev.onRegenerate === next.onRegenerate,
);

/**
 * Scoped component so only the last bot message subscribes to global streaming
 * state — avoids re-render thrashing across the entire virtualized list.
 */
function RegenerateButton({ onRegenerate }: { onRegenerate: () => void }) {
  const isStreaming = useIsStreaming();
  if (isStreaming) return null;

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

export default MessageItem;
