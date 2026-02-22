import React, { useState, useCallback } from "react";
import type { ChatNode, Speaker } from "../../../shared/types.ts";
import { useIsStreamingNode } from "../../stores/streaming.ts";
import { useChatMutations } from "../../hooks/useMutations.ts";
import { useDesignTemplateId } from "../../hooks/useDesignTemplate.ts";
import ForgeMessageItemLayout from "./message-item/ForgeMessageItemLayout.tsx";
import DiscordMessageItemLayout from "./message-item/DiscordMessageItemLayout.tsx";

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
    const designTemplateId = useDesignTemplateId();

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

    const onMouseEnter = useCallback(() => setIsHovered(true), []);
    const onMouseLeave = useCallback(() => setIsHovered(false), []);

    const sharedProps = {
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
    };

    return designTemplateId === "discord" ? (
      <DiscordMessageItemLayout {...sharedProps} />
    ) : (
      <ForgeMessageItemLayout {...sharedProps} />
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

export default MessageItem;
