import React, { useState, useCallback } from "react";
import type { ChatNode, Speaker } from "../../../shared/types.ts";
import { useIsStreamingNode, useIsStreaming } from "../../stores/streaming.ts";
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
  onRegenerate?: (nodeId: string) => void;
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
    const [editDraft, setEditDraft] = useState("");
    const isStreaming = useIsStreamingNode(node.id);
    const isStreamingGlobal = useIsStreaming();
    const { editMessage, deleteMessage } = useChatMutations(chatId);
    const designTemplateId = useDesignTemplateId();
    const template = getTemplate(designTemplateId);

    const handleEditSubmit = useCallback(() => {
      editMessage.mutate({ nodeId: node.id, message: editDraft });
      setIsEditing(false);
    }, [editMessage, node.id, editDraft]);

    const handleEditCancel = useCallback(() => {
      setIsEditing(false);
    }, []);

    const handleStartEdit = useCallback(() => {
      setEditDraft(node.message);
      setIsEditing(true);
    }, [node.message]);

    const handleCopy = useCallback(() => {
      navigator.clipboard.writeText(node.message).catch(() => {
        // Silently fail if clipboard not available
      });
    }, [node.message]);

    const handleDelete = useCallback(() => {
      const confirmed = window.confirm(
        "Delete this message and all its descendants?",
      );
      if (confirmed) {
        deleteMessage.mutate(node.id);
      }
    }, [deleteMessage, node.id]);

    const onMouseEnter = useCallback(() => setIsHovered(true), []);
    const onMouseLeave = useCallback(() => setIsHovered(false), []);

    /* Show regenerate on all non-user messages (not just the last one). */
    const showRegenerate =
      speaker != null && !speaker.is_user && onRegenerate != null;

    /* Actions visible: always during edit (save/cancel), hover otherwise */
    const actionsVisible = isEditing || (isHovered && !isStreaming);

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
      editDraft,
      onEditDraftChange: setEditDraft,
      handleEditSubmit,
      handleEditCancel,
      dateDividerDate,
      isFirstMessage,
      characterName,
      characterAvatarUrl,
    };

    const RegenerateButton = template.RegenerateButton;
    const MessageActions = template.MessageActions;

    return (
      <div
        className="group/message relative"
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        <template.MessageItem {...sharedProps} />
        {showRegenerate && onRegenerate && (
          <RegenerateButton
            onRegenerate={onRegenerate}
            nodeId={node.id}
            isStreaming={isStreamingGlobal}
          />
        )}
        <MessageActions
          onEdit={handleStartEdit}
          onCopy={handleCopy}
          onDelete={handleDelete}
          onSave={handleEditSubmit}
          onCancel={handleEditCancel}
          isVisible={actionsVisible}
          isEditing={isEditing}
        />
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
    prev.onRegenerate === next.onRegenerate &&
    prev.dateDividerDate === next.dateDividerDate &&
    prev.isFirstMessage === next.isFirstMessage &&
    prev.characterName === next.characterName &&
    prev.characterAvatarUrl === next.characterAvatarUrl,
);

export default MessageItem;
