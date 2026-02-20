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
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "row",
          padding: isFirstInGroup
            ? "0.5rem 1rem 0.15rem 1rem"
            : "0.15rem 1rem 0.15rem 1rem",
          gap: "0.6rem",
          transition: "background-color 0.15s",
          backgroundColor: isHovered ? "var(--color-surface-raised)" : "transparent",
        }}
      >
        {/* Avatar column — always present for alignment */}
        <div
          style={{
            width: 50,
            minWidth: 50,
            display: "flex",
            justifyContent: "center",
            alignSelf: "flex-start",
            paddingTop: isFirstInGroup ? 2 : 0,
          }}
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
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: speaker.color ?? "#333",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  color: "#fff",
                  flexShrink: 0,
                }}
              >
                {speaker.name.charAt(0).toUpperCase()}
              </div>
            )
          )}
        </div>

        {/* Content column */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {isFirstInGroup && speaker && (
            <MessageMeta
              speaker={speaker}
              createdAt={node.created_at}
              updatedAt={node.updated_at}
            />
          )}

          <div style={{ paddingTop: "0.5rem" }}>
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

          {/* Hide branch navigation during streaming */}
          {!isStreaming && (
            <MessageBranch
              nodeId={node.id}
              siblingInfo={siblingInfo}
              chatId={chatId}
            />
          )}
        </div>

        {/* Hover actions — disabled during streaming */}
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
