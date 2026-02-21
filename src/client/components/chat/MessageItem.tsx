import React, { useState, useCallback } from "react";
import type { ChatNode, Speaker } from "../../../shared/types.ts";
import { useIsStreamingNode } from "../../stores/streaming.ts";
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
    prev.siblingInfo?.index === next.siblingInfo?.index &&
    prev.siblingInfo?.total === next.siblingInfo?.total &&
    prev.speaker?.id === next.speaker?.id &&
    prev.speaker?.avatar_url === next.speaker?.avatar_url &&
    prev.speaker?.name === next.speaker?.name &&
    prev.userName === next.userName,
);

export default MessageItem;
