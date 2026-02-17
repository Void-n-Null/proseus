import React, { useState, useCallback } from "react";
import type { ChatNode, Speaker } from "../../../shared/types.ts";
import { useIsStreamingNode } from "../../stores/streaming.ts";
import { useChatMutations } from "../../hooks/useMutations.ts";
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
}

const MessageItem = React.memo(
  function MessageItem({
    node,
    speaker,
    siblingInfo,
    chatId,
    isFirstInGroup,
    isLast,
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
          backgroundColor: isHovered ? "#111" : "transparent",
        }}
      >
        {/* Avatar column — always present for alignment */}
        <div
          style={{
            width: 36,
            minWidth: 36,
            display: "flex",
            justifyContent: "center",
            paddingTop: isFirstInGroup ? 2 : 0,
          }}
        >
          {isFirstInGroup && speaker && (
            speaker.avatar_url ? (
              <img
                src={speaker.avatar_url}
                alt={speaker.name}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  objectFit: "cover",
                  flexShrink: 0,
                }}
              />
            ) : (
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: speaker.color ?? "#555",
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

          <MessageContent
            message={node.message}
            isEditing={isEditing}
            isStreaming={isStreaming}
            speakerColor={speaker?.color}
            onEditSubmit={handleEditSubmit}
            onEditCancel={handleEditCancel}
          />

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
    prev.siblingInfo?.total === next.siblingInfo?.total,
);

export default MessageItem;
