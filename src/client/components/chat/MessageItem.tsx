import React, { useState, useCallback } from "react";
import type { ChatNode, Speaker } from "../../../shared/types.ts";
import { useIsStreamingNode } from "../../stores/streaming.ts";
import { useChatMutations } from "../../hooks/useMutations.ts";
import { useDesignTemplateId } from "../../hooks/useDesignTemplate.ts";
import { getTemplate } from "../../templates/index.ts";

interface MessageItemProps {
  node: ChatNode;
  speaker: Speaker | undefined;
  siblingInfo: { index: number; total: number } | null;
  chatId: string;
  isFirstInGroup: boolean;
  isLast: boolean;
  userName: string;
  onRegenerate?: () => void;
  dateDividerDate?: number;
  isFirstMessage?: boolean;
  characterName?: string | null;
  characterAvatarUrl?: string | null;
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
    dateDividerDate,
    isFirstMessage,
    characterName,
    characterAvatarUrl,
  }: MessageItemProps) {
    const [isHovered, setIsHovered] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const isStreaming = useIsStreamingNode(node.id);
    const { editMessage } = useChatMutations(chatId);
    const designTemplateId = useDesignTemplateId();
    const template = getTemplate(designTemplateId);

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
      dateDividerDate,
      isFirstMessage,
      characterName,
      characterAvatarUrl,
    };

    return <template.MessageItem {...sharedProps} />;
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
    prev.onRegenerate === next.onRegenerate &&
    prev.dateDividerDate === next.dateDividerDate &&
    prev.isFirstMessage === next.isFirstMessage &&
    prev.characterName === next.characterName &&
    prev.characterAvatarUrl === next.characterAvatarUrl,
);

export default MessageItem;
